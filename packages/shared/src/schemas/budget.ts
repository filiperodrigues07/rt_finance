import { z } from "zod";
import { cuid, isoDate, amountCents } from "./common.js";

/** month: 1º dia do mês (YYYY-MM-01). memberId nulo = orçamento do casal. */
export const upsertBudgetBody = z.object({
  categoryId: cuid,
  month: isoDate,
  amountCents,
  memberId: cuid.nullable().optional(),
  rollover: z.boolean().default(false),
});
export type UpsertBudgetBody = z.infer<typeof upsertBudgetBody>;

export const listBudgetsQuery = z.object({
  month: isoDate.optional(),
});

export interface BudgetStatus {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  month: string;
  amountCents: number;
  spentCents: number;
  percent: number;
  memberId: string | null;
}
