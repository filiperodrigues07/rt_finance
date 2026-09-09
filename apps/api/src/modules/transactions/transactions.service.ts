import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, Transaction } from "@prisma/client";
import {
  todayIso,
  toCents,
  type CreateTransactionBody,
  type UpdateTransactionBody,
  type ListTransactionsQuery,
  type TransferBody,
  type PayTransactionBody,
  type BulkActionResult,
  type Paginated,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { DomainError, NotFoundError } from "../../common/errors/domain-error";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { paginate } from "../../common/pagination";
import { InvoicesService } from "../invoices/invoices.service";
import { HintResolver } from "../hints/hint-resolver.service";
import { fastPath } from "../ai/fast-path";

const TX_INCLUDE = {
  category: { select: { id: true, name: true, icon: true, color: true } },
  member: { select: { id: true, displayName: true, color: true } },
  account: { select: { id: true, name: true, type: true } },
  creditCard: { select: { id: true, name: true, color: true, icon: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TransactionInclude;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly hints: HintResolver,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------- validações de escopo ----------
  private async assertMember(householdId: string, memberId: string): Promise<void> {
    const found = await this.prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("Membro");
  }

  private async assertCategory(householdId: string, categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) return;
    const found = await this.prisma.category.findFirst({
      where: { id: categoryId, householdId },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("Categoria");
  }

  private async assertAccount(householdId: string, accountId: string): Promise<void> {
    const found = await this.prisma.account.findFirst({
      where: { id: accountId, householdId, archivedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("Conta");
  }

  /** "150", "1.234,56", "r$ 90" → centavos; qualquer outra coisa → null. */
  private centsFromSearch(s: string): number | null {
    if (!/\d/.test(s) || /[a-z]/i.test(s.replace(/r\$/i, "").trim())) return null;
    try {
      const c = toCents(s);
      return c > 0 ? c : null;
    } catch {
      return null;
    }
  }

  // ---------- leitura ----------
  async list(householdId: string, q: ListTransactionsQuery): Promise<Paginated<Transaction>> {
    const searchCents = q.search ? this.centsFromSearch(q.search) : null;
    const where: Prisma.TransactionWhereInput = {
      householdId,
      type: q.type,
      status: q.scheduled ? "PENDING" : q.status,
      // "a pagar" = contas agendadas manualmente; parcelas de cartão têm view própria
      installmentId: q.scheduled ? null : undefined,
      categoryId: q.categoryId,
      memberId: q.memberId,
      accountId: q.accountId,
      creditCardId: q.creditCardId,
      date:
        q.from || q.to
          ? { gte: q.from ? dateOnly(q.from) : undefined, lte: q.to ? dateOnly(q.to) : undefined }
          : undefined,
      // busca ampla: descrição OU notas OU valor exato
      OR: q.search
        ? [
            { description: { contains: q.search, mode: "insensitive" } },
            { notes: { contains: q.search, mode: "insensitive" } },
            ...(searchCents != null ? [{ amountCents: searchCents }] : []),
          ]
        : undefined,
      // faixa de valor
      amountCents:
        q.minCents != null || q.maxCents != null
          ? { gte: q.minCents ?? undefined, lte: q.maxCents ?? undefined }
          : undefined,
    };

    const effectiveSort = q.scheduled && q.sort === "date" ? "dueDate" : q.sort;
    const effectiveOrder = q.scheduled && q.sort === "date" ? "asc" : q.order;
    const sortKey: Record<ListTransactionsQuery["sort"], Prisma.TransactionOrderByWithRelationInput> =
      {
        date: { date: effectiveOrder },
        amountCents: { amountCents: effectiveOrder },
        createdAt: { createdAt: effectiveOrder },
        dueDate: { dueDate: effectiveOrder },
      };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: TX_INCLUDE,
        orderBy: [sortKey[effectiveSort], { createdAt: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return paginate(data, total, q.page, q.pageSize);
  }

  async get(householdId: string, id: string): Promise<Transaction> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, householdId },
      include: TX_INCLUDE,
    });
    if (!tx) throw new NotFoundError("Transação");
    return tx;
  }

  // ---------- escrita ----------
  async create(
    householdId: string,
    createdByMemberId: string,
    body: CreateTransactionBody,
  ): Promise<Transaction> {
    const memberId = body.memberId ?? createdByMemberId;
    // validações independentes em paralelo — corta ~3 idas ao banco antes do INSERT
    const [, , , card] = await Promise.all([
      this.assertMember(householdId, memberId),
      this.assertCategory(householdId, body.categoryId),
      body.accountId ? this.assertAccount(householdId, body.accountId) : Promise.resolve(),
      body.creditCardId
        ? this.prisma.creditCard.findFirst({ where: { id: body.creditCardId, householdId } })
        : Promise.resolve(null),
    ]);
    if (body.creditCardId && !card) throw new NotFoundError("Cartão");

    return this.prisma.$transaction(async (tx) => {
      const invoice = card
        ? await this.invoices.resolveInvoiceForDate(householdId, card, body.date, tx)
        : null;

      const created = await tx.transaction.create({
        data: {
          householdId,
          type: body.type,
          amountCents: body.amountCents,
          description: body.description,
          date: dateOnly(body.date),
          dueDate: body.dueDate ? dateOnly(body.dueDate) : null,
          paidAt: body.status === "PENDING" ? null : new Date(),
          status: body.status,
          source: "MANUAL",
          notes: body.notes ?? null,
          categoryId: body.categoryId ?? null,
          accountId: body.accountId ?? null,
          creditCardId: card?.id ?? null,
          invoiceId: invoice?.id ?? null,
          memberId,
          createdById: createdByMemberId,
        },
        include: TX_INCLUDE,
      });

      if (invoice) await this.invoices.recalcTotal(invoice.id, tx);
      return created;
    });
  }

  async update(
    householdId: string,
    id: string,
    body: UpdateTransactionBody,
  ): Promise<Transaction> {
    const current = await this.prisma.transaction.findFirst({ where: { id, householdId } });
    if (!current) throw new NotFoundError("Transação");
    if (current.installmentId) {
      throw new DomainError(
        "Esta transação é parte de um parcelamento. Edite ou cancele o plano de parcelas.",
      );
    }
    if (current.transferGroupId) {
      throw new DomainError("Edite a transferência excluindo e recriando.");
    }
    const nextAccountId = body.accountId !== undefined ? body.accountId : current.accountId;
    const nextCardId = body.creditCardId !== undefined ? body.creditCardId : current.creditCardId;
    if (Boolean(nextAccountId) === Boolean(nextCardId)) {
      throw new DomainError("Informe exatamente um meio de pagamento: conta OU cartão");
    }

    // validações independentes em paralelo
    const [, , , card] = await Promise.all([
      body.memberId ? this.assertMember(householdId, body.memberId) : Promise.resolve(),
      body.categoryId !== undefined
        ? this.assertCategory(householdId, body.categoryId)
        : Promise.resolve(),
      nextAccountId ? this.assertAccount(householdId, nextAccountId) : Promise.resolve(),
      nextCardId
        ? this.prisma.creditCard.findFirst({ where: { id: nextCardId, householdId } })
        : Promise.resolve(null),
    ]);
    if (nextCardId && !card) throw new NotFoundError("Cartão");

    const nextDateIso = body.date ?? toIsoDate(current.date);

    return this.prisma.$transaction(async (tx) => {
      const newInvoice = card
        ? await this.invoices.resolveInvoiceForDate(householdId, card, nextDateIso, tx)
        : null;

      const updated = await tx.transaction.update({
        where: { id: current.id },
        data: {
          amountCents: body.amountCents,
          description: body.description,
          date: body.date ? dateOnly(body.date) : undefined,
          dueDate:
            body.dueDate === undefined ? undefined : body.dueDate ? dateOnly(body.dueDate) : null,
          status: body.status,
          notes: body.notes,
          categoryId: body.categoryId,
          memberId: body.memberId,
          accountId: nextAccountId ?? null,
          creditCardId: card?.id ?? null,
          invoiceId: newInvoice?.id ?? null,
        },
        include: TX_INCLUDE,
      });

      const affected = new Set<string>();
      if (current.invoiceId) affected.add(current.invoiceId);
      if (newInvoice) affected.add(newInvoice.id);
      for (const invId of affected) await this.invoices.recalcTotal(invId, tx);

      return updated;
    });
  }

  async remove(householdId: string, id: string): Promise<{ deleted: true }> {
    const current = await this.prisma.transaction.findFirst({ where: { id, householdId } });
    if (!current) throw new NotFoundError("Transação");
    if (current.installmentId) {
      throw new DomainError("Cancele o plano de parcelamento para remover esta parcela.");
    }

    if (current.transferGroupId) {
      await this.prisma.transaction.deleteMany({
        where: { transferGroupId: current.transferGroupId, householdId },
      });
      return { deleted: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id: current.id } });
      if (current.invoiceId) await this.invoices.recalcTotal(current.invoiceId, tx);
    });
    return { deleted: true };
  }

  // ---------- contas a pagar / dar baixa ----------
  /** Marca um agendamento (PENDING) como pago/recebido: entra no saldo. */
  async pay(householdId: string, id: string, body: PayTransactionBody): Promise<Transaction> {
    const current = await this.prisma.transaction.findFirst({ where: { id, householdId } });
    if (!current) throw new NotFoundError("Transação");
    if (current.installmentId) {
      throw new DomainError("Parcela de cartão — gerenciada pelo plano de parcelamento.");
    }
    if (current.status !== "PENDING") {
      throw new DomainError("Este lançamento já está baixado.");
    }
    const nextAccountId = body.accountId ?? current.accountId;
    if (body.accountId) await this.assertAccount(householdId, body.accountId);
    if (!nextAccountId && !current.creditCardId) {
      throw new DomainError("Escolha a conta que efetuou o pagamento.");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id: current.id },
        data: {
          status: "CONFIRMED",
          paidAt: new Date(),
          date: body.date ? dateOnly(body.date) : current.date,
          accountId: nextAccountId ?? null,
        },
        include: TX_INCLUDE,
      });
      if (current.invoiceId) await this.invoices.recalcTotal(current.invoiceId, tx);
      return updated;
    });
  }

  // ---------- ações em massa ----------
  private async loadOwned(householdId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    return this.prisma.transaction.findMany({
      where: { id: { in: unique }, householdId },
      select: {
        id: true,
        status: true,
        installmentId: true,
        transferGroupId: true,
        invoiceId: true,
        accountId: true,
        creditCardId: true,
      },
    });
  }

  async bulkDelete(householdId: string, ids: string[]): Promise<BulkActionResult> {
    const rows = await this.loadOwned(householdId, ids);
    const found = new Set(rows.map((r) => r.id));
    const skipped: BulkActionResult["skipped"] = [];
    const deletable: string[] = [];
    const invoicesToRecalc = new Set<string>();

    for (const id of new Set(ids)) {
      if (!found.has(id)) {
        skipped.push({ id, reason: "não encontrada" });
        continue;
      }
      const r = rows.find((x) => x.id === id)!;
      if (r.installmentId) {
        skipped.push({ id, reason: "parcela — cancele o parcelamento" });
        continue;
      }
      if (r.transferGroupId) {
        skipped.push({ id, reason: "transferência — exclua pela tela de contas" });
        continue;
      }
      deletable.push(id);
      if (r.invoiceId) invoicesToRecalc.add(r.invoiceId);
    }

    if (deletable.length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.transaction.deleteMany({ where: { id: { in: deletable }, householdId } });
        for (const invId of invoicesToRecalc) await this.invoices.recalcTotal(invId, tx);
      });
    }
    return { affected: deletable.length, skipped };
  }

  async bulkPay(householdId: string, ids: string[]): Promise<BulkActionResult> {
    const rows = await this.loadOwned(householdId, ids);
    const skipped: BulkActionResult["skipped"] = [];
    let affected = 0;
    for (const id of new Set(ids)) {
      const r = rows.find((x) => x.id === id);
      if (!r) {
        skipped.push({ id, reason: "não encontrada" });
        continue;
      }
      if (r.installmentId) {
        skipped.push({ id, reason: "parcela de cartão" });
        continue;
      }
      if (r.status !== "PENDING") {
        skipped.push({ id, reason: "já baixada" });
        continue;
      }
      if (!r.accountId && !r.creditCardId) {
        skipped.push({ id, reason: "sem conta definida" });
        continue;
      }
      await this.pay(householdId, id, {});
      affected++;
    }
    return { affected, skipped };
  }

  async bulkUpdate(
    householdId: string,
    ids: string[],
    patch: { categoryId?: string | null; memberId?: string },
  ): Promise<BulkActionResult> {
    if (patch.categoryId) await this.assertCategory(householdId, patch.categoryId);
    if (patch.memberId) await this.assertMember(householdId, patch.memberId);
    const rows = await this.loadOwned(householdId, ids);
    const targets = rows.filter((r) => !r.installmentId && !r.transferGroupId).map((r) => r.id);
    const skipped: BulkActionResult["skipped"] = [];
    for (const id of new Set(ids)) {
      if (!rows.some((r) => r.id === id)) skipped.push({ id, reason: "não encontrada" });
      else if (!targets.includes(id)) skipped.push({ id, reason: "parcela/transferência" });
    }
    if (targets.length) {
      await this.prisma.transaction.updateMany({
        where: { id: { in: targets }, householdId },
        data: {
          categoryId: patch.categoryId === undefined ? undefined : patch.categoryId,
          memberId: patch.memberId,
        },
      });
    }
    return { affected: targets.length, skipped };
  }

  // ---------- lançamento rápido (linguagem natural) ----------
  async quickAdd(householdId: string, memberId: string, text: string): Promise<Transaction> {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      select: { displayName: true },
    });
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    const tz = household?.timezone ?? this.env.APP_TIMEZONE;

    const draft = fastPath(text, {
      todayIso: todayIso(tz),
      members: members.map((m) => m.displayName),
      hasPending: false,
    });

    if (!draft || (draft.kind !== "create_expense" && draft.kind !== "create_income")) {
      throw new DomainError(
        'Não entendi o lançamento. Tente algo como "gastei 50 no mercado" ou use o formulário.',
      );
    }

    const kind = draft.kind === "create_expense" ? "EXPENSE" : "INCOME";
    const { category } = await this.hints.resolveCategory(householdId, draft.categoryHint, kind);
    const resolvedMember = await this.hints.resolveMember(householdId, draft.memberHint, memberId);
    const pay = await this.hints.resolvePayment(householdId, draft.paymentHint);
    if (!pay.accountId && !pay.creditCardId) {
      throw new DomainError("Cadastre uma conta ou cartão antes de lançar.");
    }

    return this.create(householdId, memberId, {
      type: kind,
      amountCents: draft.amountCents,
      description: draft.description,
      date: draft.date,
      categoryId: category?.id ?? null,
      memberId: resolvedMember,
      accountId: pay.accountId,
      creditCardId: pay.creditCardId,
      status: "CONFIRMED",
      notes: null,
    });
  }

  async duplicate(
    householdId: string,
    createdByMemberId: string,
    id: string,
  ): Promise<Transaction> {
    const src = await this.prisma.transaction.findFirst({ where: { id, householdId } });
    if (!src) throw new NotFoundError("Transação");
    if (src.transferGroupId || src.type === "TRANSFER") {
      throw new DomainError("Transferências não podem ser duplicadas");
    }

    return this.create(householdId, createdByMemberId, {
      type: src.type === "INCOME" ? "INCOME" : "EXPENSE",
      amountCents: src.amountCents,
      description: src.description,
      date: toIsoDate(src.date),
      categoryId: src.categoryId,
      memberId: src.memberId,
      accountId: src.accountId,
      creditCardId: src.creditCardId,
      status: "CONFIRMED",
      notes: src.notes,
    });
  }

  /**
   * Transferência entre contas: duas pernas ligadas por transferGroupId
   * (EXPENSE na origem, INCOME no destino), sem categoria.
   * Relatórios de gasto/receita devem filtrar `transferGroupId: null`.
   */
  async transfer(
    householdId: string,
    createdByMemberId: string,
    body: TransferBody,
  ): Promise<Transaction[]> {
    if (body.fromAccountId === body.toAccountId) {
      throw new DomainError("Conta de origem e destino devem ser diferentes");
    }
    const memberId = body.memberId ?? createdByMemberId;
    await this.assertMember(householdId, memberId);
    await this.assertAccount(householdId, body.fromAccountId);
    await this.assertAccount(householdId, body.toAccountId);

    const groupId = randomUUID();
    const shared = {
      householdId,
      amountCents: body.amountCents,
      date: dateOnly(body.date),
      status: "CONFIRMED" as const,
      source: "MANUAL" as const,
      notes: body.notes ?? null,
      transferGroupId: groupId,
      memberId,
      createdById: createdByMemberId,
      categoryId: null,
    };

    return this.prisma.$transaction([
      this.prisma.transaction.create({
        data: {
          ...shared,
          type: "EXPENSE",
          description: `${body.description} (saída)`,
          accountId: body.fromAccountId,
        },
        include: TX_INCLUDE,
      }),
      this.prisma.transaction.create({
        data: {
          ...shared,
          type: "INCOME",
          description: `${body.description} (entrada)`,
          accountId: body.toAccountId,
        },
        include: TX_INCLUDE,
      }),
    ]);
  }
}
