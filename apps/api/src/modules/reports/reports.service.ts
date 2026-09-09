import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  resolvePeriod,
  firstDayOfMonth,
  lastDayOfMonth,
  addMonths,
  todayIso,
  addDays,
  percentOf,
  monthLabelBR,
  type DashboardQuery,
  type DashboardReport,
  type Insight,
  type MonthlyPoint,
  type CashFlowMonth,
  type CategoryTrend,
  type MemberComparison,
  type MonthPace,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { dateOnly, toIsoDate } from "../../common/date-only";

/**
 * Só entram em relatórios de gasto/receita: lançamentos REALIZADOS (confirmados ou
 * compensados) e fora de transferências. Agendados (PENDING) e cancelados ficam de fora.
 */
const REAL_MOVEMENT: Prisma.TransactionWhereInput = {
  status: { in: ["CONFIRMED", "CLEARED"] },
  transferGroupId: null,
};

/** Janela (dias) da média móvel do gasto variável usada na projeção do mês. */
const PACE_BASIS_DAYS = 60;
/** Meses cheios anteriores usados como baseline no fluxo de caixa projetado. */
const CASHFLOW_BASELINE_MONTHS = 3;

function brlCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async timezone(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    return h?.timezone ?? this.env.APP_TIMEZONE;
  }

  async dashboard(
    householdId: string,
    q: Partial<DashboardQuery> = {},
  ): Promise<DashboardReport> {
    const months = q.months ?? 6;
    const tz = await this.timezone(householdId);
    const range =
      q.from && q.to
        ? { from: q.from, to: q.to }
        : resolvePeriod("THIS_MONTH", { tz, ref: todayIso(tz) });

    const dateFilter = { gte: dateOnly(range.from), lte: dateOnly(range.to) };
    const inRange: Prisma.TransactionWhereInput = {
      householdId,
      ...REAL_MOVEMENT,
      date: dateFilter,
    };

    // período anterior de mesmo tamanho (para os comparativos ▲▼)
    const spanDays = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
    const prevTo = addDays(range.from, -1, tz);
    const prevFrom = addDays(prevTo, -(spanDays - 1), tz);
    const prevRange: Prisma.TransactionWhereInput = {
      householdId,
      ...REAL_MOVEMENT,
      date: { gte: dateOnly(prevFrom), lte: dateOnly(prevTo) },
    };

    // filtros opcionais — mesclados por último para vencer os defaults (ex. creditCardId)
    const scope: Prisma.TransactionWhereInput = {
      ...(q.memberId ? { memberId: q.memberId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.creditCardId ? { creditCardId: q.creditCardId } : {}),
    };

    const [
      byType,
      accounts,
      accountMoves,
      byCategoryRaw,
      incomeByCategoryRaw,
      byMemberRaw,
      byCardRaw,
      invoices,
      monthly,
      prevByType,
      prevByCategoryRaw,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: { ...inRange, ...scope },
        _sum: { amountCents: true },
      }),
      this.prisma.account.findMany({
        where: { householdId, archivedAt: null, ...(q.accountId ? { id: q.accountId } : {}) },
        select: { id: true, openingBalanceCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: {
          householdId,
          status: { in: ["CONFIRMED", "CLEARED"] },
          accountId: q.accountId ?? { not: null },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...inRange, type: "EXPENSE", ...scope },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...inRange, type: "INCOME", ...scope },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["memberId"],
        where: { ...inRange, type: "EXPENSE", ...scope },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["creditCardId"],
        where: { ...inRange, type: "EXPENSE", creditCardId: { not: null }, ...scope },
        _sum: { amountCents: true },
      }),
      this.prisma.creditCardInvoice.findMany({
        where: { creditCard: { householdId }, status: { not: "PAID" } },
        select: { totalCents: true, dueDate: true },
      }),
      this.monthlyEvolution(householdId, months, tz),
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: { ...prevRange, ...scope },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...prevRange, type: "EXPENSE", ...scope },
        _sum: { amountCents: true },
      }),
    ]);

    const sumType = (t: "INCOME" | "EXPENSE", rows: typeof byType) =>
      rows.find((r) => r.type === t)?._sum.amountCents ?? 0;

    const incomeCents = sumType("INCOME", byType);
    const expenseCents = sumType("EXPENSE", byType);

    const openingTotal = accounts.reduce((acc, a) => acc + a.openingBalanceCents, 0);
    const balanceCents =
      openingTotal + sumType("INCOME", accountMoves) - sumType("EXPENSE", accountMoves);

    const invoicesOpenCents = invoices.reduce((acc, i) => acc + i.totalCents, 0);
    const horizon = addDays(todayIso(tz), 15, tz);
    const upcomingDueCents = invoices
      .filter((i) => toIsoDate(i.dueDate) <= horizon)
      .reduce((acc, i) => acc + i.totalCents, 0);

    // categorias (despesa + receita)
    const catIds = [
      ...new Set(
        [...byCategoryRaw, ...incomeByCategoryRaw]
          .map((r) => r.categoryId)
          .filter(Boolean) as string[],
      ),
    ];
    const cats = await this.prisma.category.findMany({
      where: { id: { in: catIds } },
      select: { id: true, name: true, icon: true, color: true },
    });
    const catMap = new Map(cats.map((c) => [c.id, c]));
    const toSlices = (
      rows: { categoryId: string | null; _sum: { amountCents: number | null } }[],
      totalCents: number,
    ) =>
      rows
        .map((r) => {
          const c = r.categoryId ? catMap.get(r.categoryId) : undefined;
          const cents = r._sum.amountCents ?? 0;
          return {
            categoryId: r.categoryId,
            name: c?.name ?? "Sem categoria",
            icon: c?.icon ?? "❔",
            color: c?.color ?? "#94A3B8",
            cents,
            percent: percentOf(cents, totalCents),
          };
        })
        .sort((a, b) => b.cents - a.cents);
    const byCategory = toSlices(byCategoryRaw, expenseCents);
    const incomeByCategory = toSlices(incomeByCategoryRaw, incomeCents);

    // membros
    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      select: { id: true, displayName: true, color: true },
    });
    const memMap = new Map(members.map((m) => [m.id, m]));
    const byMember = byMemberRaw
      .map((r) => ({
        memberId: r.memberId,
        displayName: memMap.get(r.memberId)?.displayName ?? "?",
        color: memMap.get(r.memberId)?.color ?? "#94A3B8",
        cents: r._sum.amountCents ?? 0,
      }))
      .sort((a, b) => b.cents - a.cents);

    // cartões
    const cardIds = byCardRaw.map((r) => r.creditCardId).filter(Boolean) as string[];
    const cards = await this.prisma.creditCard.findMany({
      where: { id: { in: cardIds } },
      select: { id: true, name: true, color: true, icon: true },
    });
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const byCard = byCardRaw
      .map((r) => ({
        creditCardId: r.creditCardId as string,
        name: cardMap.get(r.creditCardId as string)?.name ?? "?",
        color: cardMap.get(r.creditCardId as string)?.color ?? "#8B5CF6",
        icon: cardMap.get(r.creditCardId as string)?.icon ?? "💳",
        cents: r._sum.amountCents ?? 0,
      }))
      .sort((a, b) => b.cents - a.cents);

    return {
      range,
      balanceCents,
      incomeCents,
      expenseCents,
      resultCents: incomeCents - expenseCents,
      invoicesOpenCents,
      upcomingDueCents,
      byCategory,
      incomeByCategory,
      byMember,
      byCard,
      monthly,
      prev: {
        incomeCents: sumType("INCOME", prevByType),
        expenseCents: sumType("EXPENSE", prevByType),
        expenseByCategory: prevByCategoryRaw
          .filter((r) => r.categoryId)
          .map((r) => ({ categoryId: r.categoryId as string, cents: r._sum.amountCents ?? 0 })),
      },
    };
  }

  /** Destaques do Dashboard: comparativos com o mês passado + projeção do mês. Máx. 4. */
  async insights(householdId: string): Promise<Insight[]> {
    const [dash, pace] = await Promise.all([
      this.dashboard(householdId, {}),
      this.pace(householdId),
    ]);
    const out: Insight[] = [];
    const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0);
    const MATERIAL = 100_00;

    // 1. despesa total vs mês passado
    if (dash.prev.expenseCents > 0 && dash.expenseCents - dash.prev.expenseCents >= MATERIAL) {
      const p = pct(dash.expenseCents, dash.prev.expenseCents);
      if (p >= 15) {
        out.push({
          id: "expense-up",
          severity: p >= 40 ? "bad" : "warn",
          icon: "trending-up",
          title: `Gastos ${p}% acima do mês passado`,
          detail: `${brlCents(dash.expenseCents)} contra ${brlCents(dash.prev.expenseCents)} até agora.`,
          link: "/transacoes",
        });
      }
    } else if (
      dash.prev.expenseCents > 0 &&
      dash.prev.expenseCents - dash.expenseCents >= MATERIAL
    ) {
      const p = pct(dash.prev.expenseCents, dash.expenseCents);
      out.push({
        id: "expense-down",
        severity: "info",
        icon: "trending-down",
        title: `Gastos ${p}% abaixo do mês passado`,
        detail: `Ritmo mais leve: ${brlCents(dash.expenseCents)} até agora.`,
      });
    }

    // 2. categoria que disparou
    const prevCat = new Map(dash.prev.expenseByCategory.map((c) => [c.categoryId, c.cents]));
    for (const c of dash.byCategory.slice(0, 6)) {
      if (!c.categoryId || c.cents < MATERIAL) continue;
      const before = prevCat.get(c.categoryId) ?? 0;
      if (before < MATERIAL) continue;
      const p = pct(c.cents, before);
      if (p >= 25) {
        out.push({
          id: `cat-${c.categoryId}`,
          severity: p >= 60 ? "warn" : "info",
          icon: "activity",
          title: `${c.name} +${p}% este mês`,
          detail: `${brlCents(c.cents)} em ${c.name.toLowerCase()} — ${brlCents(before)} no mês passado.`,
          link: "/relatorios",
        });
      }
    }

    // 3. projeção do mês
    if (pace.projectedResultCents < 0 && pace.daysElapsed >= 5) {
      out.push({
        id: "pace-negative",
        severity: "bad",
        icon: "alert-triangle",
        title: "Projeção do mês no vermelho",
        detail:
          `Fecha em ${brlCents(pace.projectedResultCents)}: ` +
          `${brlCents(pace.knownBillsRemainingCents)} de contas ainda a vencer + ` +
          `${brlCents(pace.discretionaryPerDayCents)}/dia de gasto variável.`,
        link: "/relatorios",
      });
    } else if (
      pace.daysElapsed >= 5 &&
      dash.prev.expenseCents > 0 &&
      pace.projectedSpendCents - dash.prev.expenseCents >= MATERIAL
    ) {
      const p = pct(pace.projectedSpendCents, dash.prev.expenseCents);
      if (p >= 12) {
        out.push({
          id: "pace-high",
          severity: "warn",
          icon: "gauge",
          title: `Mês deve fechar ${p}% acima`,
          detail: `Projeção de ${brlCents(pace.projectedSpendCents)} em despesas (${brlCents(dash.prev.expenseCents)} mês passado).`,
          link: "/relatorios",
        });
      }
    }

    const rank = { bad: 0, warn: 1, info: 2 } as const;
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 4);
  }

  /** Exporta transações do período como CSV (separador ';', compatível com Excel pt-BR). */
  async exportTransactionsCsv(
    householdId: string,
    range: { from?: string; to?: string },
  ): Promise<string> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        householdId,
        date:
          range.from || range.to
            ? { gte: range.from ? dateOnly(range.from) : undefined, lte: range.to ? dateOnly(range.to) : undefined }
            : undefined,
      },
      include: {
        category: { select: { name: true } },
        member: { select: { displayName: true } },
        account: { select: { name: true } },
        creditCard: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    });

    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = [
      "Data",
      "Tipo",
      "Descrição",
      "Categoria",
      "Responsável",
      "Meio",
      "Valor",
      "Status",
    ].join(";");

    const lines = rows.map((t) =>
      [
        toIsoDate(t.date),
        t.type,
        esc(t.description),
        esc(t.category?.name ?? ""),
        esc(t.member.displayName),
        esc(t.creditCard?.name ?? t.account?.name ?? ""),
        (t.amountCents / 100).toFixed(2).replace(".", ","),
        t.status,
      ].join(";"),
    );

    return `﻿${[header, ...lines].join("\r\n")}\r\n`;
  }

  async monthlyEvolution(
    householdId: string,
    months: number,
    tz?: string,
  ): Promise<MonthlyPoint[]> {
    const zone = tz ?? (await this.timezone(householdId));
    const start = firstDayOfMonth(addMonths(todayIso(zone), -(months - 1), zone), zone);
    const end = addMonths(start, months, zone);

    const rows = await this.prisma.transaction.findMany({
      where: {
        householdId,
        ...REAL_MOVEMENT,
        type: { in: ["INCOME", "EXPENSE"] },
        date: { gte: dateOnly(start), lt: dateOnly(end) },
      },
      select: { type: true, amountCents: true, date: true },
    });

    const buckets = new Map<string, { incomeCents: number; expenseCents: number }>();
    for (let i = 0; i < months; i++) {
      buckets.set(addMonths(start, i, zone), { incomeCents: 0, expenseCents: 0 });
    }
    for (const r of rows) {
      const key = firstDayOfMonth(toIsoDate(r.date), zone);
      const b = buckets.get(key);
      if (!b) continue;
      if (r.type === "INCOME") b.incomeCents += r.amountCents;
      else b.expenseCents += r.amountCents;
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({
        month,
        incomeCents: b.incomeCents,
        expenseCents: b.expenseCents,
        balanceCents: b.incomeCents - b.expenseCents,
      }));
  }

  // ============ dashboards extras ============

  private async currentBalanceCents(householdId: string): Promise<number> {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archivedAt: null },
      select: { id: true, openingBalanceCents: true },
    });
    const moves = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { householdId, status: { in: ["CONFIRMED", "CLEARED"] }, accountId: { not: null } },
      _sum: { amountCents: true },
    });
    const s = (t: "INCOME" | "EXPENSE") => moves.find((m) => m.type === t)?._sum.amountCents ?? 0;
    return accounts.reduce((a, x) => a + x.openingBalanceCents, 0) + s("INCOME") - s("EXPENSE");
  }

  /**
   * Fluxo de caixa projetado. Mês 0 usa a projeção "realista" do mês (pace v2);
   * meses seguintes somam recorrências + parcelas + faturas conhecidas e, quando
   * não há recorrência de renda/gasto cadastrada, caem numa média dos últimos
   * meses para não assumir renda zero.
   */
  async cashFlow(householdId: string, months = 6): Promise<CashFlowMonth[]> {
    const tz = await this.timezone(householdId);
    const start = firstDayOfMonth(todayIso(tz), tz);
    const baselineStart = firstDayOfMonth(addMonths(start, -CASHFLOW_BASELINE_MONTHS, tz), tz);
    let running = await this.currentBalanceCents(householdId);

    const [installments, invoices, scheduledBills, histAgg, histVariable, pace] = await Promise.all([
      this.prisma.installment.findMany({
        where: { plan: { householdId }, status: { in: ["SCHEDULED", "BILLED"] } },
        select: { amountCents: true, dueDate: true },
      }),
      this.prisma.creditCardInvoice.findMany({
        where: { creditCard: { householdId }, status: { not: "PAID" } },
        select: { totalCents: true, dueDate: true },
      }),
      // contas a pagar já agendadas (inclui as séries mensais)
      this.prisma.transaction.findMany({
        where: {
          householdId,
          status: "PENDING",
          type: "EXPENSE",
          installmentId: null,
          transferGroupId: null,
        },
        select: { amountCents: true, dueDate: true, date: true },
      }),
      // últimos meses cheios: média de renda e de gasto real
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: {
          householdId,
          ...REAL_MOVEMENT,
          date: { gte: dateOnly(baselineStart), lt: dateOnly(start) },
        },
        _sum: { amountCents: true },
      }),
      // gasto variável (sem parcela) nos mesmos meses → baseline do dia-a-dia
      this.prisma.transaction.aggregate({
        where: {
          householdId,
          ...REAL_MOVEMENT,
          type: "EXPENSE",
          installmentId: null,
          date: { gte: dateOnly(baselineStart), lt: dateOnly(start) },
        },
        _sum: { amountCents: true },
      }),
      this.pace(householdId),
    ]);

    const histSum = (t: "INCOME" | "EXPENSE") =>
      histAgg.find((g) => g.type === t)?._sum.amountCents ?? 0;
    const incomeBaseline = Math.round(histSum("INCOME") / CASHFLOW_BASELINE_MONTHS);
    const baselineVariableExpense = Math.round(
      (histVariable._sum.amountCents ?? 0) / CASHFLOW_BASELINE_MONTHS,
    );
    const billDue = (b: { dueDate: Date | null; date: Date }) =>
      toIsoDate(b.dueDate ?? b.date);

    const out: CashFlowMonth[] = [];
    for (let i = 0; i < months; i++) {
      const month = addMonths(start, i, tz);
      const monthEnd = lastDayOfMonth(month, tz);

      let incomeCents: number;
      let expenseCents: number;
      if (i === 0) {
        // mês corrente: já realizado + conta fixa a vencer + dia-a-dia restante
        incomeCents = pace.projectedIncomeCents;
        expenseCents = pace.projectedSpendCents;
      } else {
        const instThisMonth = installments
          .filter((x) => toIsoDate(x.dueDate) >= month && toIsoDate(x.dueDate) <= monthEnd)
          .reduce((a, x) => a + x.amountCents, 0);
        const invThisMonth = invoices
          .filter((x) => toIsoDate(x.dueDate) >= month && toIsoDate(x.dueDate) <= monthEnd)
          .reduce((a, x) => a + x.totalCents, 0);
        const billsThisMonth = scheduledBills
          .filter((x) => billDue(x) >= month && billDue(x) <= monthEnd)
          .reduce((a, x) => a + x.amountCents, 0);
        incomeCents = incomeBaseline;
        expenseCents = baselineVariableExpense + billsThisMonth + instThisMonth + invThisMonth;
      }

      const netCents = incomeCents - expenseCents;
      running += netCents;
      out.push({ month, incomeCents, expenseCents, netCents, runningBalanceCents: running });
    }
    return out;
  }

  /** Série de gastos por categoria por mês (top N). */
  async categoryTrend(householdId: string, months = 6): Promise<CategoryTrend> {
    const tz = await this.timezone(householdId);
    const start = firstDayOfMonth(addMonths(todayIso(tz), -(months - 1), tz), tz);
    const end = addMonths(start, months, tz);
    const monthKeys = Array.from({ length: months }, (_, i) => addMonths(start, i, tz));

    const rows = await this.prisma.transaction.findMany({
      where: {
        householdId,
        ...REAL_MOVEMENT,
        type: "EXPENSE",
        date: { gte: dateOnly(start), lt: dateOnly(end) },
      },
      select: { amountCents: true, date: true, categoryId: true },
    });
    const cats = await this.prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true, color: true, icon: true },
    });
    const catMap = new Map(cats.map((c) => [c.id, c]));

    const byCat = new Map<string, number[]>();
    for (const r of rows) {
      const key = r.categoryId ?? "none";
      const idx = monthKeys.indexOf(firstDayOfMonth(toIsoDate(r.date), tz));
      if (idx < 0) continue;
      if (!byCat.has(key)) byCat.set(key, Array(months).fill(0));
      byCat.get(key)![idx] += r.amountCents;
    }

    const series = [...byCat.entries()]
      .map(([key, points]) => {
        const c = key !== "none" ? catMap.get(key) : undefined;
        return {
          categoryId: key === "none" ? null : key,
          name: c?.name ?? "Sem categoria",
          color: c?.color ?? "#94A3B8",
          icon: c?.icon ?? "•",
          points,
          total: points.reduce((a, b) => a + b, 0),
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
      .map(({ total: _t, ...s }) => s);

    return { months: monthKeys, series };
  }

  /** Comparativo por membro no período. */
  async byMember(householdId: string, opts: { from?: string; to?: string }): Promise<MemberComparison> {
    const tz = await this.timezone(householdId);
    const range =
      opts.from && opts.to
        ? { from: opts.from, to: opts.to }
        : resolvePeriod("THIS_MONTH", { tz, ref: todayIso(tz) });
    const dateFilter = { gte: dateOnly(range.from), lte: dateOnly(range.to) };

    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      select: { id: true, displayName: true, color: true },
    });
    const cats = await this.prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true, color: true, icon: true },
    });
    const catMap = new Map(cats.map((c) => [c.id, c]));

    const result = await Promise.all(
      members.map(async (m) => {
        const where: Prisma.TransactionWhereInput = {
          householdId,
          ...REAL_MOVEMENT,
          memberId: m.id,
          date: dateFilter,
        };
        const [byType, byCatRaw, count] = await Promise.all([
          this.prisma.transaction.groupBy({ by: ["type"], where, _sum: { amountCents: true } }),
          this.prisma.transaction.groupBy({
            by: ["categoryId"],
            where: { ...where, type: "EXPENSE" },
            _sum: { amountCents: true },
          }),
          this.prisma.transaction.count({ where }),
        ]);
        const sum = (t: "INCOME" | "EXPENSE") =>
          byType.find((x) => x.type === t)?._sum.amountCents ?? 0;
        const expenseCents = sum("EXPENSE");
        const byCategory = byCatRaw
          .map((r) => {
            const c = r.categoryId ? catMap.get(r.categoryId) : undefined;
            const cents = r._sum.amountCents ?? 0;
            return {
              categoryId: r.categoryId,
              name: c?.name ?? "Sem categoria",
              icon: c?.icon ?? "•",
              color: c?.color ?? "#94A3B8",
              cents,
              percent: percentOf(cents, expenseCents),
            };
          })
          .sort((a, b) => b.cents - a.cents);
        return { member: m, expenseCents, incomeCents: sum("INCOME"), count, byCategory };
      }),
    );

    const totalExpense = result.reduce((a, r) => a + r.expenseCents, 0);
    return {
      range,
      members: result
        .map((r) => ({
          memberId: r.member.id,
          displayName: r.member.displayName,
          color: r.member.color,
          expenseCents: r.expenseCents,
          incomeCents: r.incomeCents,
          count: r.count,
          sharePercent: percentOf(r.expenseCents, totalExpense),
          byCategory: r.byCategory,
        }))
        .sort((a, b) => b.expenseCents - a.expenseCents),
    };
  }

  /** Ritmo do mês + patrimônio por mês. */
  async pace(householdId: string): Promise<MonthPace> {
    const tz = await this.timezone(householdId);
    const today = todayIso(tz);
    const monthStart = firstDayOfMonth(today, tz);
    const monthEnd = lastDayOfMonth(today, tz);
    const daysInMonth = Number(monthEnd.slice(-2));
    const daysElapsed = Number(today.slice(-2));

    // --- projeção "realista": separa conta fixa/agendada do gasto do dia-a-dia ---
    const remainingDays = Math.max(0, daysInMonth - daysElapsed);
    const prevMonthStart = firstDayOfMonth(addMonths(today, -1, tz), tz);
    const prevMonthEnd = lastDayOfMonth(prevMonthStart, tz);
    const win60Start = addDays(today, -(PACE_BASIS_DAYS - 1), tz);

    const [
      thisMonthAgg,
      prevMonthAgg,
      pendingRemaining,
      instRemaining,
      invoicesRemaining,
      variableWindow,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: {
          householdId,
          ...REAL_MOVEMENT,
          date: { gte: dateOnly(monthStart), lte: dateOnly(today) },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: {
          householdId,
          ...REAL_MOVEMENT,
          date: { gte: dateOnly(prevMonthStart), lte: dateOnly(prevMonthEnd) },
        },
        _sum: { amountCents: true },
      }),
      // agendados (PENDING) que ainda vencem este mês
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: {
          householdId,
          status: "PENDING",
          transferGroupId: null,
          OR: [
            { dueDate: { gt: dateOnly(today), lte: dateOnly(monthEnd) } },
            { dueDate: null, date: { gt: dateOnly(today), lte: dateOnly(monthEnd) } },
          ],
        },
        _sum: { amountCents: true },
      }),
      this.prisma.installment.aggregate({
        where: {
          plan: { householdId },
          status: { in: ["SCHEDULED", "BILLED"] },
          dueDate: { gt: dateOnly(today), lte: dateOnly(monthEnd) },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.creditCardInvoice.aggregate({
        where: {
          creditCard: { householdId },
          status: { not: "PAID" },
          dueDate: { lte: dateOnly(monthEnd) },
        },
        _sum: { totalCents: true },
      }),
      // gasto variável (sem parcela) na janela de referência
      this.prisma.transaction.aggregate({
        where: {
          householdId,
          ...REAL_MOVEMENT,
          type: "EXPENSE",
          installmentId: null,
          date: { gte: dateOnly(win60Start), lte: dateOnly(today) },
        },
        _sum: { amountCents: true },
      }),
    ]);

    const s = (
      rows: { type: string; _sum: { amountCents: number | null } }[],
      t: "INCOME" | "EXPENSE",
    ) => rows.find((g) => g.type === t)?._sum.amountCents ?? 0;

    const spentCents = s(thisMonthAgg, "EXPENSE");
    const incomeCents = s(thisMonthAgg, "INCOME");
    const lastMonthIncomeCents = s(prevMonthAgg, "INCOME");

    const knownBillsRemainingCents =
      s(pendingRemaining, "EXPENSE") +
      (instRemaining._sum.amountCents ?? 0) +
      (invoicesRemaining._sum.totalCents ?? 0);
    const knownIncomeRemainingCents = s(pendingRemaining, "INCOME");

    const discretionaryPerDayCents = Math.round(
      (variableWindow._sum.amountCents ?? 0) / PACE_BASIS_DAYS,
    );
    const discretionaryRemainingCents = discretionaryPerDayCents * remainingDays;

    const projectedSpendCents =
      spentCents + knownBillsRemainingCents + discretionaryRemainingCents;
    const projectedIncomeCents = Math.max(
      incomeCents + knownIncomeRemainingCents,
      lastMonthIncomeCents,
    );
    const projectedResultCents = projectedIncomeCents - projectedSpendCents;
    const perDayCents = daysElapsed > 0 ? Math.round(spentCents / daysElapsed) : 0;

    // patrimônio por mês (12): openingBalance + acumulado (receita-despesa) + metas
    const monthsBack = 12;
    const start = firstDayOfMonth(addMonths(today, -(monthsBack - 1), tz), tz);
    const opening = (
      await this.prisma.account.findMany({
        where: { householdId, archivedAt: null },
        select: { openingBalanceCents: true },
      })
    ).reduce((a, x) => a + x.openingBalanceCents, 0);
    const goalsTotal = (
      await this.prisma.financialGoal.aggregate({
        where: { householdId, status: { not: "ARCHIVED" } },
        _sum: { currentCents: true },
      })
    )._sum.currentCents ?? 0;

    const priorAgg = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: {
        householdId,
        ...REAL_MOVEMENT,
        accountId: { not: null },
        date: { lt: dateOnly(start) },
      },
      _sum: { amountCents: true },
    });
    let cum =
      opening +
      (priorAgg.find((x) => x.type === "INCOME")?._sum.amountCents ?? 0) -
      (priorAgg.find((x) => x.type === "EXPENSE")?._sum.amountCents ?? 0);

    const monthRows = await this.prisma.transaction.findMany({
      where: {
        householdId,
        ...REAL_MOVEMENT,
        accountId: { not: null },
        date: { gte: dateOnly(start) },
      },
      select: { type: true, amountCents: true, date: true },
    });
    const netWorth: { month: string; cents: number }[] = [];
    for (let i = 0; i < monthsBack; i++) {
      const m = addMonths(start, i, tz);
      const mEnd = lastDayOfMonth(m, tz);
      const delta = monthRows
        .filter((r) => toIsoDate(r.date) >= m && toIsoDate(r.date) <= mEnd)
        .reduce((a, r) => a + (r.type === "INCOME" ? r.amountCents : -r.amountCents), 0);
      cum += delta;
      netWorth.push({ month: m, cents: cum + goalsTotal });
    }

    return {
      monthLabel: monthLabelBR(monthStart),
      daysElapsed,
      daysInMonth,
      spentCents,
      incomeCents,
      perDayCents,
      projectedSpendCents,
      projectedResultCents,
      netWorth,
      remainingDays,
      spentSoFarCents: spentCents,
      incomeSoFarCents: incomeCents,
      knownBillsRemainingCents,
      knownIncomeRemainingCents,
      discretionaryPerDayCents,
      discretionaryRemainingCents,
      projectedIncomeCents,
      basisDays: PACE_BASIS_DAYS,
    };
  }
}
