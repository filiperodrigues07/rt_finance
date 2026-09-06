import { z } from "zod";
import { cuid, isoDate, amountCents } from "./common.js";
import { LIMITS } from "../constants.js";

/** Compra parcelada no cartão (doc 03 fluxo 3). Cria plano + N parcelas + N transações. */
export const createInstallmentPlanBody = z.object({
  creditCardId: cuid,
  categoryId: cuid.nullable().optional(),
  memberId: cuid.optional(),
  description: z.string().trim().min(1).max(280),
  totalCents: amountCents,
  installmentCount: z.number().int().min(LIMITS.minInstallments).max(LIMITS.maxInstallments),
  purchaseDate: isoDate,
  /** Se omitido, a 1ª parcela cai na competência calculada pela data da compra. */
  firstDueDate: isoDate.nullable().optional(),
});
export type CreateInstallmentPlanBody = z.infer<typeof createInstallmentPlanBody>;

export const listInstallmentPlansQuery = z.object({
  creditCardId: cuid.optional(),
  activeOnly: z.coerce.boolean().default(true),
});

export interface FutureCommitmentMonth {
  month: string; // YYYY-MM-01
  cents: number;
}
