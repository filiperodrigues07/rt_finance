import { z } from "zod";
import { AccountType } from "../enums.js";

export const createAccountBody = z.object({
  name: z.string().trim().min(1).max(60),
  type: AccountType.default("CHECKING"),
  openingBalanceCents: z.number().int().default(0),
});
export type CreateAccountBody = z.infer<typeof createAccountBody>;

export const updateAccountBody = createAccountBody.partial();
export type UpdateAccountBody = z.infer<typeof updateAccountBody>;
