import { z } from "zod";
import { AccountType } from "../enums.js";
import { BANK_IDS } from "../banks.js";
import { cuid } from "./common.js";

export const createAccountBody = z.object({
  name: z.string().trim().min(1).max(60),
  type: AccountType.default("CHECKING"),
  openingBalanceCents: z.number().int().default(0),
  /** membro dono (opcional — vazio = compartilhada) */
  memberId: cuid.nullable().optional(),
  /** banco (id da lista BANKS) */
  bankId: z.enum(BANK_IDS).nullable().optional(),
});
export type CreateAccountBody = z.infer<typeof createAccountBody>;

export const updateAccountBody = createAccountBody.partial();
export type UpdateAccountBody = z.infer<typeof updateAccountBody>;
