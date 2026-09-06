import { z } from "zod";
import { cuid, isoDate } from "./common.js";
import { ImportSource, ImportStatus, ImportRowState } from "../enums.js";

/** Uma linha extraída de um extrato/fatura, exibida na tela de revisão. */
export interface ImportRowDTO {
  id: string;
  postedDate: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // sempre positivo
  type: "EXPENSE" | "INCOME";
  fitid: string | null;
  suggestedCategoryId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  memberId: string | null;
  state: z.infer<typeof ImportRowState>;
  confidence: number;
  duplicateTxnId: string | null;
  transactionId: string | null;
}

export interface ImportBatchDTO {
  id: string;
  source: z.infer<typeof ImportSource>;
  fileName: string;
  accountId: string | null;
  creditCardId: string | null;
  status: z.infer<typeof ImportStatus>;
  rowCount: number;
  autoCount: number;
  reviewCount: number;
  committedCount: number;
  totalCents: number;
  error: string | null;
  createdAt: string;
}

export interface ImportBatchDetail extends ImportBatchDTO {
  rows: ImportRowDTO[];
}

/** Corpo do POST /imports — o arquivo vai como multipart; estes são os campos de texto. */
export const createImportFields = z
  .object({
    kind: z.enum(["BANK", "CARD"]),
    accountId: cuid.optional(),
    creditCardId: cuid.optional(),
  })
  .refine(
    (v) => (v.kind === "BANK" ? Boolean(v.accountId) : Boolean(v.creditCardId)),
    "Selecione a conta (extrato) ou o cartão (fatura).",
  );
export type CreateImportFields = z.infer<typeof createImportFields>;

export const patchImportRowBody = z.object({
  categoryId: cuid.nullable().optional(),
  memberId: cuid.nullable().optional(),
  type: z.enum(["EXPENSE", "INCOME"]).optional(),
  amountCents: z.number().int().positive().max(1_000_000_00).optional(),
  description: z.string().trim().min(1).max(280).optional(),
  postedDate: isoDate.optional(),
  state: ImportRowState.optional(),
});
export type PatchImportRowBody = z.infer<typeof patchImportRowBody>;

export const commitImportBody = z.object({
  rowIds: z.array(cuid).optional(), // ausente = todas as elegíveis
});
export type CommitImportBody = z.infer<typeof commitImportBody>;

export interface CommitImportResult {
  committed: number;
  skipped: number;
  batch: ImportBatchDTO;
}
