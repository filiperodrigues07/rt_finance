import { z } from "zod";
import { hexColor, cuid } from "./common.js";
import { CardStatus } from "../enums.js";
import { BANK_IDS } from "../banks.js";

const dayOfMonth = z.number().int().min(1).max(31);

export const createCreditCardBody = z.object({
  name: z.string().trim().min(1).max(60),
  bank: z.string().trim().max(60).nullable().optional(),
  bankId: z.enum(BANK_IDS).nullable().optional(),
  memberId: cuid.nullable().optional(),
  brand: z.string().trim().max(30).nullable().optional(),
  last4: z
    .string()
    .regex(/^\d{4}$/, "esperado 4 dígitos")
    .nullable()
    .optional(),
  limitCents: z.number().int().min(0).default(0),
  closingDay: dayOfMonth,
  dueDay: dayOfMonth,
  color: hexColor.default("#8B5CF6"),
  icon: z.string().trim().min(1).max(8).default("💳"),
  status: CardStatus.default("ACTIVE"),
});
export type CreateCreditCardBody = z.infer<typeof createCreditCardBody>;

export const updateCreditCardBody = createCreditCardBody.partial();
export type UpdateCreditCardBody = z.infer<typeof updateCreditCardBody>;

export interface CreditCardLimits {
  limitCents: number;
  usedCents: number;
  availableCents: number;
}
