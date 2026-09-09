/** Enums espelhando o schema.prisma. Fonte de verdade para validação nas bordas. */
import { z } from "zod";

export const MemberRole = z.enum(["OWNER", "MEMBER"]);
export type MemberRole = z.infer<typeof MemberRole>;

export const TransactionType = z.enum(["EXPENSE", "INCOME", "TRANSFER"]);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionStatus = z.enum(["PENDING", "CONFIRMED", "CLEARED", "CANCELED"]);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const TransactionSource = z.enum(["MANUAL", "WHATSAPP", "RECURRING", "IMPORT"]);
export type TransactionSource = z.infer<typeof TransactionSource>;

export const CategoryKind = z.enum(["EXPENSE", "INCOME", "BOTH"]);
export type CategoryKind = z.infer<typeof CategoryKind>;

export const AccountType = z.enum(["CHECKING", "SAVINGS", "CASH", "WALLET", "MEAL_VOUCHER"]);
export type AccountType = z.infer<typeof AccountType>;

export const CardStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type CardStatus = z.infer<typeof CardStatus>;

export const InvoiceStatus = z.enum(["OPEN", "CLOSED", "PAID", "OVERDUE"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const InstallmentStatus = z.enum(["SCHEDULED", "BILLED", "PAID", "CANCELED"]);
export type InstallmentStatus = z.infer<typeof InstallmentStatus>;

export const RecurrenceFrequency = z.enum(["WEEKLY", "MONTHLY", "YEARLY"]);
export type RecurrenceFrequency = z.infer<typeof RecurrenceFrequency>;

export const GoalStatus = z.enum(["ACTIVE", "ACHIEVED", "ARCHIVED"]);
export type GoalStatus = z.infer<typeof GoalStatus>;

export const NotificationType = z.enum([
  "INVOICE_DUE",
  "BILL_DUE",
  "BUDGET_THRESHOLD",
  "BUDGET_EXCEEDED",
  "GOAL_MILESTONE",
  "WEEKLY_SUMMARY",
  "TRANSACTION_COMMENT",
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationChannel = z.enum(["WEB", "WHATSAPP", "BOTH"]);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

export const NotificationStatus = z.enum(["PENDING", "SENT", "READ", "DISMISSED"]);
export type NotificationStatus = z.infer<typeof NotificationStatus>;

export const MessageDirection = z.enum(["INBOUND", "OUTBOUND"]);
export type MessageDirection = z.infer<typeof MessageDirection>;

export const MessageType = z.enum(["TEXT", "IMAGE", "AUDIO", "DOCUMENT", "INTERACTIVE", "OTHER"]);
export type MessageType = z.infer<typeof MessageType>;

export const AiConversationState = z.enum(["IDLE", "AWAITING_CONFIRMATION", "AWAITING_EDIT"]);
export type AiConversationState = z.infer<typeof AiConversationState>;

export const AiChannel = z.enum(["WHATSAPP", "WEB"]);
export type AiChannel = z.infer<typeof AiChannel>;

export const ImportSource = z.enum(["OFX_BANK", "OFX_CARD", "PDF_BANK", "PDF_CARD", "IMG_BANK", "IMG_CARD"]);
export type ImportSource = z.infer<typeof ImportSource>;

export const ImportStatus = z.enum(["PARSING", "REVIEW", "COMMITTED", "FAILED", "DISCARDED"]);
export type ImportStatus = z.infer<typeof ImportStatus>;

export const AttachmentKind = z.enum(["BOLETO", "RECEIPT", "OTHER"]);
export type AttachmentKind = z.infer<typeof AttachmentKind>;

export const ImportRowState = z.enum([
  "AUTO_COMMITTED",
  "NEEDS_REVIEW",
  "COMMITTED",
  "SKIPPED",
  "DUPLICATE",
]);
export type ImportRowState = z.infer<typeof ImportRowState>;
