/** Constantes de domínio compartilhadas entre backend, IA e frontend. */

export const DEFAULT_CURRENCY = "BRL";
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/** Templates de consulta que a IA pode escolher (nunca gera SQL). Ver doc 01 §4.3. */
export const QUERY_TEMPLATES = [
  "SPEND_BY_PERIOD",
  "SPEND_BY_CATEGORY",
  "SPEND_BY_MEMBER",
  "REMAINING_BUDGET",
  "TOP_EXPENSES",
  "BILLS_DUE",
  "CARD_INVOICE",
  "FUTURE_COMMITMENT",
  "MONTHLY_SUMMARY",
  "ACCOUNT_BALANCE",
] as const;
export type QueryTemplate = (typeof QUERY_TEMPLATES)[number];

/** Categorias criadas pelo seed (isSystem = true). Não podem ser excluídas. */
export interface SystemCategorySeed {
  name: string;
  icon: string;
  color: string;
  kind: "EXPENSE" | "INCOME" | "BOTH";
}

export const SYSTEM_CATEGORIES: SystemCategorySeed[] = [
  { name: "Mercado", icon: "🛒", color: "#22C55E", kind: "EXPENSE" },
  { name: "Alimentação", icon: "🍔", color: "#F97316", kind: "EXPENSE" },
  { name: "Transporte", icon: "🚗", color: "#3B82F6", kind: "EXPENSE" },
  { name: "Casa", icon: "🏠", color: "#8B5CF6", kind: "EXPENSE" },
  { name: "Contas", icon: "💡", color: "#EAB308", kind: "EXPENSE" },
  { name: "Cartão", icon: "💳", color: "#EC4899", kind: "EXPENSE" },
  { name: "Lazer", icon: "🎮", color: "#06B6D4", kind: "EXPENSE" },
  { name: "Roupas", icon: "👕", color: "#F43F5E", kind: "EXPENSE" },
  { name: "Saúde", icon: "💊", color: "#10B981", kind: "EXPENSE" },
  { name: "Assinaturas", icon: "📱", color: "#6366F1", kind: "EXPENSE" },
  { name: "Educação", icon: "📚", color: "#0EA5E9", kind: "EXPENSE" },
  { name: "Viagens", icon: "✈️", color: "#14B8A6", kind: "EXPENSE" },
  { name: "Eletrônicos", icon: "🔌", color: "#64748B", kind: "EXPENSE" },
  { name: "Salário", icon: "💰", color: "#16A34A", kind: "INCOME" },
  { name: "Renda extra", icon: "💵", color: "#65A30D", kind: "INCOME" },
  { name: "Outros", icon: "📦", color: "#94A3B8", kind: "BOTH" },
];

export const FALLBACK_CATEGORY_NAME = "Outros";

/** Milestones de meta que disparam notificação. */
export const GOAL_MILESTONES = [25, 50, 75, 100] as const;

/** Limites de validação. */
export const LIMITS = {
  minInstallments: 2,
  maxInstallments: 60,
  maxDescriptionLength: 280,
  maxNotesLength: 2000,
  minAmountCents: 1,
  maxAmountCents: 1_000_000_000, // R$ 10.000.000,00
} as const;
