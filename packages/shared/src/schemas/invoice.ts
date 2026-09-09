import { z } from "zod";
import { cuid, isoDate } from "./common.js";
import { InvoiceStatus } from "../enums.js";

/** Pagamento de fatura de cartão: debita a conta escolhida e libera o limite. */
export const payInvoiceBody = z.object({
  accountId: cuid,
  date: isoDate.optional(),
});
export type PayInvoiceBody = z.infer<typeof payInvoiceBody>;

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
