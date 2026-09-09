import type {
  CategoryKind,
  AccountType,
  CardStatus,
  InvoiceStatus,
  TransactionType,
  TransactionStatus,
  TransactionSource,
  MemberRole,
} from "@rt-finance/shared";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  parentId: string | null;
  isSystem: boolean;
  archivedAt: string | null;
}

export interface OwnerRef {
  id: string;
  displayName: string;
  color: string;
  user: { avatarUrl?: string | null };
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalanceCents: number;
  balanceCents: number;
  memberId: string | null;
  bankId: string | null;
  member: OwnerRef | null;
  archivedAt: string | null;
}

export interface CreditCard {
  id: string;
  name: string;
  bank: string | null;
  bankId: string | null;
  memberId: string | null;
  member: OwnerRef | null;
  brand: string | null;
  last4: string | null;
  limitCents: number;
  openingUsedCents: number;
  closingDay: number;
  dueDay: number;
  color: string;
  icon: string;
  status: CardStatus;
  limits: { limitCents: number; usedCents: number; availableCents: number };
}

export interface CreditCardInvoice {
  id: string;
  creditCardId: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  totalCents: number;
  paidAt: string | null;
}

export interface TransactionRow {
  id: string;
  type: TransactionType;
  amountCents: number;
  description: string;
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  notes: string | null;
  transferGroupId: string | null;
  installmentId: string | null;
  categoryId: string | null;
  accountId: string | null;
  creditCardId: string | null;
  invoiceId: string | null;
  memberId: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  member: { id: string; displayName: string; color: string };
  account: { id: string; name: string; type: AccountType } | null;
  creditCard: { id: string; name: string; color: string; icon: string } | null;
  _count: { comments: number; attachments: number };
}

export interface Installment {
  id: string;
  number: number;
  amountCents: number;
  dueDate: string;
  status: "SCHEDULED" | "BILLED" | "PAID" | "CANCELED";
}

export interface InstallmentPlan {
  id: string;
  description: string;
  totalCents: number;
  installmentCount: number;
  purchaseDate: string;
  firstDueDate: string;
  creditCard: { id: string; name: string; color: string; icon: string };
  category: { id: string; name: string; icon: string; color: string } | null;
  member: { id: string; displayName: string };
  installments: Installment[];
}

export interface Member {
  id: string;
  role: MemberRole;
  displayName: string;
  color: string;
  user: {
    id: string;
    name: string;
    email: string;
    phoneE164: string | null;
    avatarUrl?: string | null;
    avatarColor?: string | null;
  };
}

export interface Household {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  members: Member[];
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phoneE164: string | null;
  avatarColor: string;
  avatarUrl: string | null;
}

/** Config global de SMTP (só super-admin). */
export interface GlobalEmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromName: string;
  configured: boolean;
  usingEnvFallback: boolean;
}

/** Preferência de e-mail do household. */
export interface EmailPrefs {
  weeklyEnabled: boolean;
  emailReady: boolean;
}

export interface RecurringExpense {
  id: string;
  name: string;
  amountCents: number | null;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  dayOfMonth: number | null;
  occurrenceCount: number | null;
  autoPost: boolean;
  active: boolean;
  startDate: string;
  endDate: string | null;
  category: { id: string; name: string; icon: string; color: string };
  member: { id: string; displayName: string };
  accountId: string | null;
  creditCardId: string | null;
  _count?: { runs: number };
}

export interface GoalContribution {
  id: string;
  amountCents: number;
  date: string;
  note: string | null;
  member?: { displayName: string };
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetCents: number;
  currentCents: number;
  deadline: string | null;
  icon: string;
  color: string;
  status: "ACTIVE" | "ACHIEVED" | "ARCHIVED";
  contributions: GoalContribution[];
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  status: "PENDING" | "SENT" | "READ" | "DISMISSED";
  createdAt: string;
  data?: Record<string, unknown> | null;
}

export interface WhatsappStatus {
  provider: string;
  enabled: boolean;
  evolutionReachable: boolean;
  state: "open" | "connecting" | "close" | "unknown";
  connected: boolean;
  number: string | null;
  profileName: string | null;
  instance: string;
  webhookUrl: string;
  allowlist: string[];
}

export interface WhatsappQr {
  state: WhatsappStatus["state"];
  qrBase64: string | null;
  pairingCode: string | null;
}
