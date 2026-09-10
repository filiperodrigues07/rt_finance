import { Injectable, Logger } from "@nestjs/common";
import type { ReceiptScan, TransactionAttachmentDTO } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { DomainError, NotFoundError } from "../../common/errors/domain-error";
import type { UploadedFile } from "../../common/read-upload";
import { extractImageText } from "../imports/parsers/image-text";
import { parseReceipt } from "./receipt-parse";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg"];

function toDto(a: {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): TransactionAttachmentDTO {
  return {
    id: a.id,
    kind: a.kind as TransactionAttachmentDTO["kind"],
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Boleto (antes de pagar) e comprovante (depois) anexados a um lançamento — guardados no Postgres. */
@Injectable()
export class TransactionAttachmentsService {
  private readonly logger = new Logger(TransactionAttachmentsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** OCR sob demanda de um anexo-imagem: devolve valor/data/descrição sugeridos. */
  async scan(householdId: string, attachmentId: string): Promise<ReceiptScan> {
    const att = await this.prisma.transactionAttachment.findFirst({
      where: { id: attachmentId, transaction: { householdId } },
      select: { mimeType: true, fileName: true, data: true },
    });
    if (!att) throw new NotFoundError("Anexo");
    const isImage = /^image\//.test(att.mimeType) || /\.(png|jpe?g)$/i.test(att.fileName);
    if (!isImage) throw new DomainError("Só dá pra ler foto (PNG/JPG) — PDF não.");

    try {
      const text = await Promise.race([
        extractImageText(att.data),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 25_000)),
      ]);
      return parseReceipt(text);
    } catch (err) {
      this.logger.warn(`OCR do anexo falhou: ${(err as Error).message}`);
      return { isBoleto: false };
    }
  }

  private async assertTransaction(householdId: string, transactionId: string): Promise<void> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: transactionId, householdId },
      select: { id: true },
    });
    if (!tx) throw new NotFoundError("Transação");
  }

  async list(householdId: string, transactionId: string): Promise<TransactionAttachmentDTO[]> {
    await this.assertTransaction(householdId, transactionId);
    const rows = await this.prisma.transactionAttachment.findMany({
      where: { transactionId },
      select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDto);
  }

  async upload(
    householdId: string,
    transactionId: string,
    upload: UploadedFile,
    kind: "BOLETO" | "RECEIPT" | "OTHER",
  ): Promise<TransactionAttachmentDTO> {
    await this.assertTransaction(householdId, transactionId);
    if (upload.buffer.length > MAX_BYTES) {
      throw new DomainError("Arquivo muito grande — o limite é 5 MB.");
    }
    const okExt = /\.(pdf|png|jpe?g)$/i.test(upload.filename);
    if (!ALLOWED_MIME.includes(upload.mimetype) && !okExt) {
      throw new DomainError("Formato não aceito. Envie PDF, PNG ou JPG.");
    }
    const created = await this.prisma.transactionAttachment.create({
      data: {
        transactionId,
        kind,
        fileName: upload.filename.slice(0, 200),
        mimeType: upload.mimetype || "application/octet-stream",
        sizeBytes: upload.buffer.length,
        data: upload.buffer,
      },
      select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
    });
    return toDto(created);
  }

  async getFile(
    householdId: string,
    attachmentId: string,
  ): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const att = await this.prisma.transactionAttachment.findFirst({
      where: { id: attachmentId, transaction: { householdId } },
      select: { fileName: true, mimeType: true, data: true },
    });
    if (!att) throw new NotFoundError("Anexo");
    return { fileName: att.fileName, mimeType: att.mimeType, data: att.data };
  }

  async remove(householdId: string, attachmentId: string): Promise<{ deleted: true }> {
    const att = await this.prisma.transactionAttachment.findFirst({
      where: { id: attachmentId, transaction: { householdId } },
      select: { id: true },
    });
    if (!att) throw new NotFoundError("Anexo");
    await this.prisma.transactionAttachment.delete({ where: { id: att.id } });
    return { deleted: true };
  }
}
