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

    const [
      byType,
      accounts,
      accountMoves,
      byCategoryRaw,
      byMemberRaw,
      byCardRaw,
      invoices,
      monthly,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: inRange,
        _sum: { amountCents: true },
      }),
      this.prisma.account.findMany({
        where: { householdId, archivedAt: null },
        select: { id: true, openingBalanceCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: {
          householdId,
          status: { in: ["CONFIRMED", "CLEARED"] },
          accountId: { not: null },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...inRange, type: "EXPENSE" },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["memberId"],
        where: { ...inRange, type: "EXPENSE" },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["creditCardId"],
        where: { ...inRange, type: "EXPENSE", creditCardId: { not: null } },
        _sum: { amountCents: true },
      }),
      this.prisma.creditCardInvoice.findMany({
        where: { creditCard: { householdId }, status: { not: "PAID" } },
        select: { totalCents: true, dueDate: true },
      }),
      this.monthlyEvolution(householdId, months, tz),
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

    // categorias
    const catIds = byCategoryRaw.map((r) => r.categoryId).filter(Boolean) as string[];
    const cats = await this.prisma.category.findMany({
      where: { id: { in: catIds } },
      select: { id: true, name: true, icon: true, color: true },
    });
    const catMap = new Map(cats.map((c) => [c.id, c]));
    const byCategory = byCategoryRaw
      .map((r) => {
        const c = r.categoryId ? catMap.get(r.categoryId) : undefined;
        const cents = r._sum.amountCents ?? 0;
        return {
          categoryId: r.categoryId,
          name: c?.name ?? "Sem categoria",
          icon: c?.icon ?? "❔",
          color: c?.color ?? "#94A3B8",
          cents,
          percent: percentOf(cents, expenseCents),
        };
      })
      .sort((a, b) => b.cents - a.cents);

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
      byMember,
      byCard,
      monthly,
    };
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

  /** Fluxo de caixa projetado: saldo previsto por mês somando previsíveis. */
  async cashFlow(householdId: string, months = 6): Promise<CashFlowMonth[]> {
    const tz = await this.timezone(householdId);
    const start = firstDayOfMonth(todayIso(tz), tz);
    let running = await this.currentBalanceCents(householdId);

    const [recurring, installments, invoices] = await Promise.all([
      this.prisma.recurringExpense.findMany({
        where: { householdId, active: true, amountCents: { not: null } },
        select: { amountCents: true, category: { select: { kind: true } } },
      }),
      this.prisma.installment.findMany({
        where: { plan: { householdId }, status: { in: ["SCHEDULED", "BILLED"] } },
        select: { amountCents: true, dueDate: true },
      }),
      this.prisma.creditCardInvoice.findMany({
        where: { creditCard: { householdId }, status: { not: "PAID" } },
        select: { totalCents: true, dueDate: true },
      }),
    ]);
    const recurringIncome = recurring
      .filter((r) => r.category.kind === "INCOME")
      .reduce((a, r) => a + (r.amountCents ?? 0), 0);
    const recurringExpense = recurring
      .filter((r) => r.category.kind !== "INCOME")
      .reduce((a, r) => a + (r.amountCents ?? 0), 0);

    const out: CashFlowMonth[] = [];
    for (let i = 0; i < months; i++) {
      const month = addMonths(start, i, tz);
      const monthEnd = lastDayOfMonth(month, tz);
      const instThisMonth = installments
        .filter((x) => toIsoDate(x.dueDate) >= month && toIsoDate(x.dueDate) <= monthEnd)
        .reduce((a, x) => a + x.amountCents, 0);
      const invThisMonth =
        i === 0
          ? invoices
              .filter((x) => toIsoDate(x.dueDate) <= monthEnd)
              .reduce((a, x) => a + x.totalCents, 0)
          : invoices
              .filter((x) => toIsoDate(x.dueDate) >= month && toIsoDate(x.dueDate) <= monthEnd)
              .reduce((a, x) => a + x.totalCents, 0);

      const incomeCents = recurringIncome;
      const expenseCents = recurringExpense + instThisMonth + invThisMonth;
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

    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: {
        householdId,
        ...REAL_MOVEMENT,
        date: { gte: dateOnly(monthStart), lte: dateOnly(today) },
      },
      _sum: { amountCents: true },
    });
    const s = (t: "INCOME" | "EXPENSE") => grouped.find((g) => g.type === t)?._sum.amountCents ?? 0;
    const spentCents = s("EXPENSE");
    const incomeCents = s("INCOME");
    const perDayCents = daysElapsed > 0 ? Math.round(spentCents / daysElapsed) : 0;
    const projectedSpendCents = perDayCents * daysInMonth;

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
      projectedResultCents: incomeCents - projectedSpendCents,
      netWorth,
    };
  }
}
