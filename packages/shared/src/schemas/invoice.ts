import { z } from "zod";
import { cuid, isoDate } from "./common.js";
import { InvoiceStatus } from "../enums.js";

/** Pagamento de fatura de cartão: debita a conta escolhida e libera o limite. */
export const payInvoiceBody = z.object({
  accountId: cuid,
  date: isoDate.optional(),
});
export type PayInvoiceBody = z.infer<typeof payInvoiceBody>;

/** Ajustes manuais na fatura: saldo inicial (não detalhado) e valor real para conferência. */
export const updateInvoiceBody = z
  .object({
    openingBalanceCents: z.number().int().min(0).optional(),
    statementTotalCents: z.number().int().min(0).nullable().optional(),
  })
  .refine((b) => b.openingBalanceCents != null || b.statementTotalCents !== undefined, {
    message: "informe openingBalanceCents ou statementTotalCents",
  });
export type UpdateInvoiceBody = z.infer<typeof updateInvoiceBody>;

/** Conciliação: joga a diferença no saldo inicial ou cria um lançamento de ajuste na fatura. */
export const adjustInvoiceBody = z.object({
  mode: z.enum(["opening", "transaction"]),
  /** com sinal; se omitido usa a diferença atual (statementTotalCents - totalCents). */
  amountCents: z.number().int().optional(),
  description: z.string().trim().max(120).optional(),
  categoryId: cuid.nullable().optional(),
});
export type AdjustInvoiceBody = z.infer<typeof adjustInvoiceBody>;

/** Quita em massa as faturas de meses anteriores de um cartão (onboarding). */
export const settlePastInvoicesBody = z.object({
  throughMonth: isoDate.optional(),
});
export type SettlePastInvoicesBody = z.infer<typeof settlePastInvoicesBody>;

export interface InvoiceAdjustmentRow {
  id: string;
  description: string;
  amountCents: number; // com sinal (EXPENSE positivo, INCOME negativo)
  date: string;
  categoryId: string | null;
}

export interface InvoiceDetail {
  id: string;
  creditCardId: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  status: z.infer<typeof InvoiceStatus>;
  totalCents: number;
  openingBalanceCents: number;
  /** "Limite já utilizado" do cartão (dívida geral, fora de qualquer fatura) — só pra exibir. */
  cardOpeningUsedCents: number;
  itemizedCents: number; // lançamentos normais (sem ajustes), com sinal
  adjustmentsCents: number; // soma dos ajustes, com sinal
  statementTotalCents: number | null;
  diffCents: number; // (statementTotalCents ?? totalCents) - totalCents
  reconciledAt: string | null;
  adjustments: InvoiceAdjustmentRow[];
}

/** Fatura em aberto que pode ser paga (qualquer cartão do household). */
export interface PayableInvoice {
  id: string;
  creditCardId: string;
  card: { name: string; color: string; icon: string };
  referenceMonth: string;
  dueDate: string;
  status: z.infer<typeof InvoiceStatus>;
  totalCents: number;
}

export interface PayInvoiceResult {
  invoiceId: string;
  paymentTransactionId: string;
  amountCents: number;
}
