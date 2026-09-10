import { z } from "zod";
import { AttachmentKind } from "../enums.js";

/** Anexo de um lançamento: boleto (antes de pagar) ou comprovante (depois). */
export interface TransactionAttachmentDTO {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const uploadAttachmentFields = z.object({
  kind: AttachmentKind.default("OTHER"),
});
export type UploadAttachmentFields = z.infer<typeof uploadAttachmentFields>;

/** Resultado do OCR de um anexo-foto (valor/data/descrição sugeridos). */
export interface ReceiptScan {
  amountCents?: number;
  date?: string;
  description?: string;
  isBoleto: boolean;
}
