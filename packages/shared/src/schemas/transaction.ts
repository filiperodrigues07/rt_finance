import { z } from "zod";
import { cuid, isoDate, amountCents } from "./common.js";
import { TransactionStatus, TransactionType } from "../enums.js";

/** Lançamento manual (painel web, doc etapa §15). TRANSFER usa endpoint próprio. */
export const createTransactionBody = z
  .object({
    type: z.enum(["EXPENSE", "INCOME"]),
    amountCents,
    description: z.string().trim().min(1).max(280),
    date: isoDate,
    /** Vencimento (contas a pagar/receber). Quando presente + status PENDING, é um agendamento. */
    dueDate: isoDate.nullable().optional(),
    categoryId: cuid.nullable().optional(),
    memberId: cuid.optional(), // default: membro autenticado
    accountId: cuid.nullable().optional(),
    creditCardId: cuid.nullable().optional(),
    status: TransactionStatus.default("CONFIRMED"),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) => Boolean(v.accountId) !== Boolean(v.creditCardId),
    "Informe exatamente um meio de pagamento: accountId OU creditCardId",
  );
export type CreateTransactionBody = z.infer<typeof createTransactionBody>;

/** Dar baixa num agendamento (marcar como pago/recebido). */
export const payTransactionBody = z.object({
  date: isoDate.optional(), // data efetiva do pagamento (default: hoje)
  accountId: cuid.optional(), // conta que pagou (default: a do lançamento)
});
export type PayTransactionBody = z.infer<typeof payTransactionBody>;

export const bulkIdsBody = z.object({
  ids: z.array(cuid).min(1).max(200),
});
export type BulkIdsBody = z.infer<typeof bulkIdsBody>;

export const bulkCategorizeBody = z.object({
  ids: z.array(cuid).min(1).max(200),
  categoryId: cuid.nullable().optional(),
  memberId: cuid.optional(),
});
export type BulkCategorizeBody = z.infer<typeof bulkCategorizeBody>;

export const quickAddBody = z.object({
  text: z.string().trim().min(2).max(280),
});
export type QuickAddBody = z.infer<typeof quickAddBody>;

/**
 * Resposta do lançamento rápido (`POST /transactions/quick`). O backend tenta
 * resolver por regras (instantâneo) e, se não der, cai no LLM. Três desfechos:
 * - `created`: lançamento simples já gravado.
 * - `preview`: compra parcelada entendida, aguardando confirmação do usuário
 *   (o front mostra o resumo e confirma via `POST /installments/plans`).
 * - `needs_form`: não deu pra concluir com segurança — abrir o formulário
 *   pré-preenchido com o que foi extraído.
 */
export interface QuickAddPreviewPlan {
  creditCardId: string;
  cardLabel: string;
  categoryId: string | null;
  categoryLabel: string;
  memberId: string;
  description: string;
  totalCents: number;
  installmentCount: number;
  /** valor da 1ª parcela (as demais podem variar 1 centavo no arredondamento) */
  installmentCents: number;
  purchaseDate: string;
  firstDueDate: string | null;
  /** ex.: "fatura de outubro de 2026 · vence 10/10/2026" */
  firstInvoiceLabel: string;
}

export interface QuickAddDraft {
  type: "EXPENSE" | "INCOME";
  amountCents: number | null;
  description: string;
  installmentCount: number | null;
}

export type QuickAddResult =
  | { status: "created"; transaction: unknown }
  | { status: "preview"; plan: QuickAddPreviewPlan }
  | { status: "needs_form"; reason: string; draft: QuickAddDraft };

export interface BulkActionResult {
  affected: number;
  skipped: { id: string; reason: string }[];
}

export const updateTransactionBody = z.object({
  amountCents: amountCents.optional(),
  description: z.string().trim().min(1).max(280).optional(),
  date: isoDate.optional(),
  dueDate: isoDate.nullable().optional(),
  categoryId: cuid.nullable().optional(),
  memberId: cuid.optional(),
  accountId: cuid.nullable().optional(),
  creditCardId: cuid.nullable().optional(),
  status: TransactionStatus.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateTransactionBody = z.infer<typeof updateTransactionBody>;

export const transferBody = z.object({
  amountCents,
  description: z.string().trim().min(1).max(280),
  date: isoDate,
  fromAccountId: cuid,
  toAccountId: cuid,
  memberId: cuid.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type TransferBody = z.infer<typeof transferBody>;

export const listTransactionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: TransactionType.optional(),
  status: TransactionStatus.optional(),
  /** true → só agendados (status PENDING), ordenados por vencimento. */
  scheduled: z.coerce.boolean().optional(),
  categoryId: cuid.optional(),
  memberId: cuid.optional(),
  accountId: cuid.optional(),
  creditCardId: cuid.optional(),
  /** busca ampla: casa descrição, notas ou valor (ex.: "150" acha R$ 150,00). */
  search: z.string().trim().min(1).max(120).optional(),
  /** faixa de valor (em centavos, valor absoluto). Vem como query string → coerção. */
  minCents: z.coerce.number().int().positive().max(1_000_000_000).optional(),
  maxCents: z.coerce.number().int().positive().max(1_000_000_000).optional(),
  sort: z.enum(["date", "amountCents", "createdAt", "dueDate"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;
