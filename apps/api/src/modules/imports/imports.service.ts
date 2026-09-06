import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ImportBatch, ImportRow, Prisma } from "@prisma/client";
import {
  guessCategory,
  todayIso,
  type CommitImportBody,
  type CommitImportResult,
  type CreateImportFields,
  type ImportBatchDTO,
  type ImportBatchDetail,
  type ImportRowDTO,
  type PatchImportRowBody,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { ConflictError, DomainError, NotFoundError } from "../../common/errors/domain-error";
import type { UploadedFile } from "../../common/read-upload";
import { InvoicesService } from "../invoices/invoices.service";
import { ImportAiService } from "./import-ai.service";
import { parseOfx } from "./parsers/ofx.parser";
import { extractPdfText } from "./parsers/pdf-text";
import { extractImageText } from "./parsers/image-text";

interface DraftRow {
  postedDate: string;
  description: string;
  amountCents: number;
  type: "EXPENSE" | "INCOME";
  fitid: string | null;
  categoryHint: string | null;
}

const DUP_WINDOW_DAYS = 3;

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly ai: ImportAiService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------------------------------------------------------- create
  async create(
    householdId: string,
    memberId: string,
    upload: UploadedFile,
    fields: CreateImportFields,
  ): Promise<ImportBatchDetail> {
    const target = await this.resolveTarget(householdId, fields);
    const format = detectFormat(upload);
    const kind = fields.kind === "BANK" ? "BANK" : "CARD";
    const source = `${format}_${kind}` as const;

    const batch = await this.prisma.importBatch.create({
      data: {
        householdId,
        createdById: memberId,
        source,
        fileName: upload.filename.slice(0, 200),
        accountId: target.accountId,
        creditCardId: target.creditCardId,
        status: "PARSING",
        aiModel: format === "OFX" ? null : this.ai.model,
      },
    });

    try {
      const drafts = await this.parse(householdId, upload, format, kind);
      if (drafts.length === 0) {
        await this.prisma.importBatch.update({
          where: { id: batch.id },
          data: { status: "FAILED", error: "Nenhum lançamento reconhecido no arquivo." },
        });
        throw new DomainError(
          "Não reconheci nenhum lançamento nesse arquivo. Confira se é o extrato/fatura certo.",
        );
      }
      await this.buildRows(householdId, memberId, batch, drafts);
      await this.autoCommit(householdId, memberId, batch.id);
      return this.get(householdId, batch.id);
    } catch (err) {
      if (!(err instanceof DomainError)) {
        this.logger.error(`parse falhou: ${(err as Error).stack ?? String(err)}`);
        await this.prisma.importBatch
          .update({
            where: { id: batch.id },
            data: { status: "FAILED", error: (err as Error).message.slice(0, 400) },
          })
          .catch(() => undefined);
        const reason = (err as Error).message?.slice(0, 200) || "erro desconhecido";
        throw new DomainError(`Falha ao ler o arquivo: ${reason}`);
      }
      throw err;
    }
  }

  private async resolveTarget(
    householdId: string,
    fields: CreateImportFields,
  ): Promise<{ accountId: string | null; creditCardId: string | null }> {
    if (fields.kind === "BANK") {
      const acc = await this.prisma.account.findFirst({
        where: { id: fields.accountId, householdId, archivedAt: null },
      });
      if (!acc) throw new NotFoundError("Conta");
      return { accountId: acc.id, creditCardId: null };
    }
    const card = await this.prisma.creditCard.findFirst({
      where: { id: fields.creditCardId, householdId },
    });
    if (!card) throw new NotFoundError("Cartão");
    return { accountId: null, creditCardId: card.id };
  }

  private async parse(
    householdId: string,
    upload: UploadedFile,
    format: "OFX" | "PDF" | "IMG",
    kind: "BANK" | "CARD",
  ): Promise<DraftRow[]> {
    if (format === "OFX") {
      const text = upload.buffer.toString("latin1").includes("�")
        ? upload.buffer.toString("utf8")
        : upload.buffer.toString("latin1");
      return parseOfx(text).rows.map((r) => ({
        postedDate: r.postedDate,
        description: r.description,
        amountCents: r.amountCents,
        type: r.type,
        fitid: r.fitid,
        categoryHint: guessCategory(r.description, r.type),
      }));
    }

    const text = format === "IMG" ? await extractImageText(upload.buffer) : await extractPdfText(upload.buffer);
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    const tz = household?.timezone ?? this.env.APP_TIMEZONE;
    const categories = await this.prisma.category.findMany({
      where: { householdId, archivedAt: null },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    const rows = await this.ai.extract(text, {
      source: kind,
      categories: categories.map((c) => c.name),
      todayIso: todayIso(tz),
      timezone: tz,
    });
    return rows.map((r) => ({
      postedDate: r.postedDate,
      description: r.description,
      amountCents: r.amountCents,
      type: r.type,
      fitid: null,
      categoryHint: r.categoryHint,
    }));
  }

  // ---------------------------------------------------------------- rows
  private async buildRows(
    householdId: string,
    memberId: string,
    batch: ImportBatch,
    drafts: DraftRow[],
  ): Promise<void> {
    const categories = await this.prisma.category.findMany({
      where: { householdId, archivedAt: null },
      select: { id: true, name: true, kind: true },
    });
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

    let auto = 0;
    let review = 0;
    let totalCents = 0;

    for (const d of drafts) {
      totalCents += d.type === "EXPENSE" ? -d.amountCents : d.amountCents;

      const matched = resolveCategory(byName, d.categoryHint, d.type);
      const keyword = guessCategory(d.description, d.type);
      let confidence = batch.source.startsWith("OFX") ? 0.55 : 0.45;
      if (matched) confidence += 0.3;
      if (matched && keyword && matched.name.toLowerCase() === keyword.toLowerCase()) confidence += 0.1;
      confidence = Math.min(confidence, 0.95);

      const dup = await this.findDuplicate(householdId, batch, d);
      const state = dup
        ? "DUPLICATE"
        : confidence >= 0.8 && matched
          ? "AUTO_COMMITTED"
          : "NEEDS_REVIEW";
      if (state === "AUTO_COMMITTED") auto++;
      else review++;

      await this.prisma.importRow.create({
        data: {
          batchId: batch.id,
          postedDate: dateOnly(d.postedDate),
          description: d.description,
          rawText: null,
          amountCents: d.amountCents,
          type: d.type,
          fitid: d.fitid,
          suggestedCategoryId: matched?.id ?? null,
          categoryId: matched?.id ?? null,
          memberId,
          state,
          confidence,
          duplicateTxnId: dup?.id ?? null,
        },
      });
    }

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        rowCount: drafts.length,
        autoCount: auto,
        reviewCount: review,
        totalCents,
        status: review > 0 ? "REVIEW" : "COMMITTED",
      },
    });
  }

  private async findDuplicate(
    householdId: string,
    batch: ImportBatch,
    d: DraftRow,
  ): Promise<{ id: string } | null> {
    if (d.fitid) {
      const byRef = await this.prisma.transaction.findFirst({
        where: { householdId, externalRef: `ofx:${d.fitid}` },
        select: { id: true },
      });
      if (byRef) return byRef;
    }
    const date = new Date(`${d.postedDate}T00:00:00.000Z`);
    const from = new Date(date);
    from.setUTCDate(from.getUTCDate() - DUP_WINDOW_DAYS);
    const to = new Date(date);
    to.setUTCDate(to.getUTCDate() + DUP_WINDOW_DAYS);

    return this.prisma.transaction.findFirst({
      where: {
        householdId,
        amountCents: d.amountCents,
        type: d.type,
        date: { gte: from, lte: to },
        ...(batch.accountId ? { accountId: batch.accountId } : {}),
        ...(batch.creditCardId ? { creditCardId: batch.creditCardId } : {}),
      },
      select: { id: true },
    });
  }

  // ---------------------------------------------------------------- commit
  private async autoCommit(householdId: string, memberId: string, batchId: string): Promise<void> {
    const rows = await this.prisma.importRow.findMany({
      where: { batchId, state: "AUTO_COMMITTED", transactionId: null },
    });
    if (rows.length) await this.commitRows(householdId, memberId, batchId, rows);
  }

  async commit(
    householdId: string,
    memberId: string,
    batchId: string,
    body: CommitImportBody,
  ): Promise<CommitImportResult> {
    const batch = await this.loadBatch(householdId, batchId);
    if (batch.status === "DISCARDED") throw new DomainError("Esta importação foi descartada.");

    const where: Prisma.ImportRowWhereInput = {
      batchId,
      transactionId: null,
      state: { in: ["NEEDS_REVIEW", "DUPLICATE"] },
      ...(body.rowIds?.length ? { id: { in: body.rowIds } } : {}),
    };
    const rows = await this.prisma.importRow.findMany({ where });
    const committed = rows.length ? await this.commitRows(householdId, memberId, batchId, rows) : 0;

    const remaining = await this.prisma.importRow.count({
      where: { batchId, transactionId: null, state: { in: ["NEEDS_REVIEW", "DUPLICATE"] } },
    });
    const committedCount = await this.prisma.importRow.count({
      where: { batchId, transactionId: { not: null } },
    });
    const skipped = await this.prisma.importRow.count({ where: { batchId, state: "SKIPPED" } });

    const updated = await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        committedCount,
        reviewCount: remaining,
        status: remaining === 0 ? "COMMITTED" : "REVIEW",
      },
    });
    return { committed, skipped, batch: toBatchDto(updated) };
  }

  /** Cria as transações de um conjunto de linhas, numa única transação Prisma. */
  private async commitRows(
    householdId: string,
    memberId: string,
    batchId: string,
    rows: ImportRow[],
  ): Promise<number> {
    const batch = await this.prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    const card = batch.creditCardId
      ? await this.prisma.creditCard.findUnique({ where: { id: batch.creditCardId } })
      : null;

    const touchedInvoices = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const invoice = card
          ? await this.invoices.resolveInvoiceForDate(householdId, card, toIsoDate(row.postedDate), tx)
          : null;

        const txn = await tx.transaction.create({
          data: {
            householdId,
            type: row.type,
            amountCents: row.amountCents,
            description: row.description,
            date: row.postedDate,
            status: "CONFIRMED",
            source: "IMPORT",
            externalRef: row.fitid ? `ofx:${row.fitid}` : `import:${batchId}:${row.id}`,
            categoryId: row.categoryId,
            accountId: batch.accountId,
            creditCardId: card?.id ?? null,
            invoiceId: invoice?.id ?? null,
            memberId: row.memberId ?? memberId,
            createdById: memberId,
          },
        });
        if (invoice) touchedInvoices.add(invoice.id);
        await tx.importRow.update({
          where: { id: row.id },
          data: { state: "COMMITTED", transactionId: txn.id },
        });
      }
      for (const id of touchedInvoices) await this.invoices.recalcTotal(id, tx);
    });

    return rows.length;
  }

  // ---------------------------------------------------------------- read / edit
  async list(householdId: string): Promise<ImportBatchDTO[]> {
    const batches = await this.prisma.importBatch.findMany({
      where: { householdId, status: { not: "DISCARDED" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return batches.map(toBatchDto);
  }

  async get(householdId: string, batchId: string): Promise<ImportBatchDetail> {
    const batch = await this.loadBatch(householdId, batchId);
    const rows = await this.prisma.importRow.findMany({
      where: { batchId },
      orderBy: { postedDate: "asc" },
    });
    const cats = await this.prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true },
    });
    const nameById = new Map(cats.map((c) => [c.id, c.name]));
    return { ...toBatchDto(batch), rows: rows.map((r) => toRowDto(r, nameById)) };
  }

  async patchRow(
    householdId: string,
    batchId: string,
    rowId: string,
    body: PatchImportRowBody,
  ): Promise<ImportRowDTO> {
    await this.loadBatch(householdId, batchId);
    const row = await this.prisma.importRow.findFirst({ where: { id: rowId, batchId } });
    if (!row) throw new NotFoundError("Linha da importação");
    if (row.transactionId) throw new ConflictError("Essa linha já foi importada.");

    if (body.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: { id: body.categoryId, householdId },
      });
      if (!cat) throw new NotFoundError("Categoria");
    }
    if (body.memberId) {
      const m = await this.prisma.householdMember.findFirst({
        where: { id: body.memberId, householdId },
      });
      if (!m) throw new NotFoundError("Membro");
    }

    const updated = await this.prisma.importRow.update({
      where: { id: rowId },
      data: {
        categoryId: body.categoryId === undefined ? row.categoryId : body.categoryId,
        memberId: body.memberId === undefined ? row.memberId : body.memberId,
        type: body.type ?? row.type,
        amountCents: body.amountCents ?? row.amountCents,
        description: body.description ?? row.description,
        postedDate: body.postedDate ? dateOnly(body.postedDate) : row.postedDate,
        state: body.state ?? (row.state === "DUPLICATE" ? row.state : "NEEDS_REVIEW"),
      },
    });
    const cats = await this.prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true },
    });
    return toRowDto(updated, new Map(cats.map((c) => [c.id, c.name])));
  }

  async discard(householdId: string, batchId: string): Promise<{ deleted: true }> {
    const batch = await this.loadBatch(householdId, batchId);
    // as transações já criadas permanecem; só apagamos o rascunho da importação.
    await this.prisma.importBatch.delete({ where: { id: batch.id } });
    return { deleted: true };
  }

  private async loadBatch(householdId: string, batchId: string): Promise<ImportBatch> {
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, householdId } });
    if (!batch) throw new NotFoundError("Importação");
    return batch;
  }
}

// -------------------------------------------------------------------- helpers
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export function detectFormat(upload: UploadedFile): "OFX" | "PDF" | "IMG" {
  const name = upload.filename.toLowerCase();
  const head = upload.buffer.subarray(0, 200).toString("latin1");
  if (name.endsWith(".ofx") || /OFXHEADER|<OFX>/i.test(head) || /ofx|sgml/i.test(upload.mimetype)) {
    return "OFX";
  }
  if (name.endsWith(".pdf") || head.startsWith("%PDF") || upload.mimetype.includes("pdf")) {
    return "PDF";
  }
  if (
    /\.(png|jpe?g)$/.test(name) ||
    upload.mimetype.startsWith("image/") ||
    upload.buffer.subarray(0, 4).equals(PNG_MAGIC) ||
    upload.buffer.subarray(0, 3).equals(JPEG_MAGIC)
  ) {
    return "IMG";
  }
  throw new DomainError("Formato não suportado. Envie um arquivo .ofx, .pdf, .png ou .jpg.");
}

function resolveCategory(
  byName: Map<string, { id: string; name: string; kind: string }>,
  hint: string | null,
  type: "EXPENSE" | "INCOME",
): { id: string; name: string } | null {
  if (!hint) return null;
  const direct = byName.get(hint.toLowerCase());
  const pick = direct ?? [...byName.values()].find((c) => c.name.toLowerCase() === hint.toLowerCase());
  if (!pick) return null;
  if (pick.kind !== "BOTH" && pick.kind !== type) return null;
  return { id: pick.id, name: pick.name };
}

function toBatchDto(b: ImportBatch): ImportBatchDTO {
  return {
    id: b.id,
    source: b.source,
    fileName: b.fileName,
    accountId: b.accountId,
    creditCardId: b.creditCardId,
    status: b.status,
    rowCount: b.rowCount,
    autoCount: b.autoCount,
    reviewCount: b.reviewCount,
    committedCount: b.committedCount,
    totalCents: b.totalCents,
    error: b.error,
    createdAt: b.createdAt.toISOString(),
  };
}

function toRowDto(r: ImportRow, categoryName: Map<string, string>): ImportRowDTO {
  return {
    id: r.id,
    postedDate: toIsoDate(r.postedDate),
    description: r.description,
    amountCents: r.amountCents,
    type: r.type as "EXPENSE" | "INCOME",
    fitid: r.fitid,
    suggestedCategoryId: r.suggestedCategoryId,
    categoryId: r.categoryId,
    categoryName: r.categoryId ? (categoryName.get(r.categoryId) ?? null) : null,
    memberId: r.memberId,
    state: r.state,
    confidence: r.confidence,
    duplicateTxnId: r.duplicateTxnId,
    transactionId: r.transactionId,
  };
}
