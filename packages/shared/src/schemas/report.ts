import { z } from "zod";
import { isoDate } from "./common.js";

export const dashboardQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  months: z.coerce.number().int().min(1).max(24).default(6),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  cents: number;
  percent: number;
}

export interface MemberSlice {
  memberId: string;
  displayName: string;
  color: string;
  cents: number;
}

export interface CardSlice {
  creditCardId: string;
  name: string;
  color: string;
  icon: string;
  cents: number;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM-01
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

/** Período anterior de mesmo tamanho, para os comparativos ▲▼ do Dashboard. */
export interface DashboardPrev {
  incomeCents: number;
  expenseCents: number;
  expenseByCategory: { categoryId: string; cents: number }[];
}

export interface DashboardReport {
  range: { from: string; to: string };
  balanceCents: number;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
  invoicesOpenCents: number;
  upcomingDueCents: number;
  byCategory: CategorySlice[];
  byMember: MemberSlice[];
  byCard: CardSlice[];
  monthly: MonthlyPoint[];
  prev: DashboardPrev;
}

/** Destaque do Dashboard ("card Destaques"). */
export interface Insight {
  id: string;
  severity: "info" | "warn" | "bad";
  icon: string;
  title: string;
  detail: string;
  link?: string;
}

// ---------- dashboards extras ----------
export interface CashFlowMonth {
  month: string; // YYYY-MM-01
  incomeCents: number; // receitas previstas (recorrências de renda)
  expenseCents: number; // saídas previstas (recorrências + parcelas + faturas)
  netCents: number;
  runningBalanceCents: number; // saldo projetado acumulado
}

export interface CategoryTrend {
  months: string[]; // YYYY-MM-01[]
  series: { categoryId: string | null; name: string; color: string; icon: string; points: number[] }[];
}

export interface MemberComparison {
  range: { from: string; to: string };
  members: {
    memberId: string;
    displayName: string;
    color: string;
    expenseCents: number;
    incomeCents: number;
    count: number;
    sharePercent: number;
    byCategory: CategorySlice[];
  }[];
}

export interface MonthPace {
  monthLabel: string;
  daysElapsed: number;
  daysInMonth: number;
  spentCents: number;
  incomeCents: number;
  perDayCents: number;
  projectedSpendCents: number;
  projectedResultCents: number;
  netWorth: { month: string; cents: number }[]; // patrimônio (contas+metas) por mês

  // --- projeção "realista" (v2): separa conta fixa/agendada do gasto do dia-a-dia ---
  /** dias que ainda faltam no mês */
  remainingDays: number;
  /** já gasto no mês (= spentCents) */
  spentSoFarCents: number;
  /** já recebido no mês (= incomeCents) */
  incomeSoFarCents: number;
  /** contas fixas/agendadas/parcelas/faturas que ainda vão cair este mês (valor real) */
  knownBillsRemainingCents: number;
  /** receitas previsíveis que ainda entram este mês (recorrências + agendados) */
  knownIncomeRemainingCents: number;
  /** média diária do gasto variável (sem recorrência/parcela) nos últimos `basisDays` dias */
  discretionaryPerDayCents: number;
  /** discretionaryPerDay × remainingDays */
  discretionaryRemainingCents: number;
  /** receita projetada do mês (piso = mês anterior, p/ salário concentrado) */
  projectedIncomeCents: number;
  /** janela usada na média do gasto variável */
  basisDays: number;
}
