import { Injectable } from "@nestjs/common";
import type { TransactionAttachmentDTO } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { DomainError, NotFoundError } from "../../common/errors/domain-error";
import type { UploadedFile } from "../../common/read-upload";

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
  constructor(private readonly prisma: PrismaService) {}

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
