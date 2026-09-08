/**
 * Contrato da saída da IA (doc 03 §2). A IA devolve SEMPRE um objeto deste union,
 * validado por Zod antes de qualquer efeito no domínio. Ela envia "hints" de texto,
 * nunca IDs — o backend resolve contra os dados reais do household.
 */
import { z } from "zod";
import { QUERY_TEMPLATES, LIMITS } from "./constants.js";

const Money = z.number().int().min(LIMITS.minAmountCents).max(LIMITS.maxAmountCents);
const IsoDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "esperado YYYY-MM-DD");
const Confidence = z.number().min(0).max(1);

const draftBase = {
  categoryHint: z.string().trim().min(1).nullable(),
  memberHint: z.string().trim().min(1).nullable(),
  confidence: Confidence,
  ambiguous: z.boolean(),
  clarification: z.string().trim().min(1).nullable(),
};

export const DraftExpense = z.object({
  kind: z.literal("create_expense"),
  amountCents: Money,
  description: z.string().trim().min(1).max(LIMITS.maxDescriptionLength),
  date: IsoDateStr,
  paymentHint: z.string().trim().min(1).nullable(),
  ...draftBase,
});
export type DraftExpense = z.infer<typeof DraftExpense>;

export const DraftIncome = DraftExpense.extend({ kind: z.literal("create_income") });
export type DraftIncome = z.infer<typeof DraftIncome>;

export const DraftInstallmentPurchase = z.object({
  kind: z.literal("create_installment_purchase"),
  totalCents: Money,
  installmentCount: z.number().int().min(LIMITS.minInstallments).max(LIMITS.maxInstallments),
  description: z.string().trim().min(1).max(LIMITS.maxDescriptionLength),
  cardHint: z.string().trim().min(1),
  firstDueDate: IsoDateStr.nullable(),
  purchaseDate: IsoDateStr,
  ...draftBase,
});
export type DraftInstallmentPurchase = z.infer<typeof DraftInstallmentPurchase>;

export const DraftRecurring = z.object({
  kind: z.literal("create_recurring"),
  name: z.string().trim().min(1).max(LIMITS.maxDescriptionLength),
  amountCents: Money.nullable(),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  paymentHint: z.string().trim().min(1).nullable(),
  ...draftBase,
});
export type DraftRecurring = z.infer<typeof DraftRecurring>;

export const QueryRequest = z.object({
  kind: z.literal("query"),
  template: z.enum(QUERY_TEMPLATES),
  params: z.object({
    period: z.enum(["THIS_MONTH", "LAST_MONTH", "THIS_YEAR", "CUSTOM"]).default("THIS_MONTH"),
    from: IsoDateStr.nullable().default(null),
    to: IsoDateStr.nullable().default(null),
    categoryHint: z.string().trim().min(1).nullable().default(null),
    memberHint: z.string().trim().min(1).nullable().default(null),
    cardHint: z.string().trim().min(1).nullable().default(null),
    accountHint: z.string().trim().min(1).nullable().default(null),
    months: z.number().int().min(1).max(24).nullable().default(null),
    limit: z.number().int().min(1).max(20).nullable().default(null),
  }),
  wantsChart: z.boolean().default(false),
  confidence: Confidence,
});
export type QueryRequest = z.infer<typeof QueryRequest>;

export const ConfirmationReply = z.object({
  kind: z.literal("confirmation_reply"),
  choice: z.enum(["YES", "NO", "EDIT"]),
  editText: z.string().trim().min(1).nullable(),
});
export type ConfirmationReply = z.infer<typeof ConfirmationReply>;

export const HelpRequest = z.object({ kind: z.literal("help") });

export const UnknownResult = z.object({
  kind: z.literal("unknown"),
  reason: z.string().trim().min(1),
});

export const AiResult = z.discriminatedUnion("kind", [
  DraftExpense,
  DraftIncome,
  DraftInstallmentPurchase,
  DraftRecurring,
  QueryRequest,
  ConfirmationReply,
  HelpRequest,
  UnknownResult,
]);
export type AiResult = z.infer<typeof AiResult>;
export type AiResultKind = AiResult["kind"];

/** Rascunho já RESOLVIDO (com IDs), guardado em AiConversation.pendingAction. */
export const PendingAction = z.object({
  kind: z.enum(["expense", "income", "installment_purchase", "recurring"]),
  summaryText: z.string(),
  payload: z.record(z.unknown()),
  createdAtIso: z.string(),
});
export type PendingAction = z.infer<typeof PendingAction>;
