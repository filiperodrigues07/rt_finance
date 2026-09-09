import { z } from "zod";
import { cuid, isoDate, amountCents } from "./common.js";
import { RecurrenceFrequency } from "../enums.js";

export const createRecurringBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    amountCents: amountCents.nullable().optional(), // null = valor variável
    categoryId: cuid,
    memberId: cuid.optional(),
    frequency: RecurrenceFrequency.default("MONTHLY"),
    interval: z.number().int().min(1).max(24).default(1),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    /** Nº fixo de lançamentos (ex.: financiamento 12x). null/omitido = sem fim. */
    occurrenceCount: z.number().int().min(1).max(360).nullable().optional(),
    // padrão: gera as ocorrências em "A pagar" (PENDING); true = lança direto (CONFIRMED)
    autoPost: z.boolean().default(false),
    accountId: cuid.nullable().optional(),
    creditCardId: cuid.nullable().optional(),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
  })
  .refine(
    (v) => !(v.accountId && v.creditCardId),
    "Escolha no máximo um meio de pagamento",
  );
export type CreateRecurringBody = z.infer<typeof createRecurringBody>;

export const updateRecurringBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  amountCents: amountCents.nullable().optional(),
  categoryId: cuid.optional(),
  memberId: cuid.optional(),
  frequency: RecurrenceFrequency.optional(),
  interval: z.number().int().min(1).max(24).optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  occurrenceCount: z.number().int().min(1).max(360).nullable().optional(),
  autoPost: z.boolean().optional(),
  accountId: cuid.nullable().optional(),
  creditCardId: cuid.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateRecurringBody = z.infer<typeof updateRecurringBody>;
