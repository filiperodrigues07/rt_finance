import { Inject, Injectable } from "@nestjs/common";
import {
  firstDayOfMonth,
  lastDayOfMonth,
  percentOf,
  formatBRL,
  monthLabelBR,
  todayIso,
  type UpsertBudgetBody,
  type BudgetStatus,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { NotFoundError } from "../../common/errors/domain-error";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async tz(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    return h?.timezone ?? this.env.APP_TIMEZONE;
  }

  async upsert(householdId: string, body: UpsertBudgetBody) {
    const category = await this.prisma.category.findFirst({
      where: { id: body.categoryId, householdId },
    });
    if (!category) throw new NotFoundError("Categoria");
    const tz = await this.tz(householdId);
    const month = dateOnly(firstDayOfMonth(body.month, tz));

    const existing = await this.prisma.budget.findFirst({
      where: {
        householdId,
        categoryId: body.categoryId,
        month,
        memberId: body.memberId ?? null,
      },
    });

    if (existing) {
      return this.prisma.budget.update({
        where: { id: existing.id },
        data: { amountCents: body.amountCents, rollover: body.rollover },
      });
    }
    return this.prisma.budget.create({
      data: {
        householdId,
        categoryId: body.categoryId,
        month,
        amountCents: body.amountCents,
        memberId: body.memberId ?? null,
        rollover: body.rollover,
      },
    });
  }

  async remove(householdId: string, id: string) {
    const b = await this.prisma.budget.findFirst({ where: { id, householdId } });
    if (!b) throw new NotFoundError("Orçamento");
    await this.prisma.budget.delete({ where: { id } });
    return { deleted: true };
  }

  async list(householdId: string, monthIso?: string): Promise<BudgetStatus[]> {
    const tz = await this.tz(householdId);
    const month = firstDayOfMonth(monthIso ?? todayIso(tz), tz);
    const budgets = await this.prisma.budget.findMany({
      where: { householdId, month: dateOnly(month) },
      include: { category: { select: { name: true, icon: true, color: true } } },
      orderBy: { category: { name: "asc" } },
    });

    const from = dateOnly(month);
    const to = dateOnly(lastDayOfMonth(month, tz));

    return Promise.all(
      budgets.map(async (b) => {
        const spent = await this.prisma.transaction.aggregate({
          where: {
            householdId,
            type: "EXPENSE",
            status: { not: "CANCELED" },
            transferGroupId: null,
            categoryId: b.categoryId,
            ...(b.memberId ? { memberId: b.memberId } : {}),
            date: { gte: from, lte: to },
          },
          _sum: { amountCents: true },
        });
        const spentCents = spent._sum.amountCents ?? 0;
        return {
          id: b.id,
          categoryId: b.categoryId,
          categoryName: b.category.name,
          categoryIcon: b.category.icon,
          categoryColor: b.category.color,
          month: toIsoDate(b.month),
          amountCents: b.amountCents,
          spentCents,
          percent: percentOf(spentCents, b.amountCents),
          memberId: b.memberId,
        };
      }),
    );
  }

  /** Verifica todos os orçamentos do mês corrente e dispara alertas (idempotente por dedupe). */
  async checkAndNotify(householdId?: string): Promise<{ checked: number; alerts: number }> {
    const scopes = householdId
      ? [householdId]
      : (await this.prisma.household.findMany({ select: { id: true } })).map((h) => h.id);

    let checked = 0;
    let alerts = 0;
    for (const hid of scopes) {
      const tz = await this.tz(hid);
      const monthIso = firstDayOfMonth(todayIso(tz), tz);
      const statuses = await this.list(hid, monthIso);
      const defaultThreshold = 80;

      for (const s of statuses) {
        checked++;
        const pref = await this.prisma.notificationPreference.findUnique({
          where: { householdId_type: { householdId: hid, type: "BUDGET_THRESHOLD" } },
        });
        const threshold = pref?.thresholdPercent ?? defaultThreshold;

        if (s.percent > 100) {
          await this.notifications.push({
            householdId: hid,
            type: "BUDGET_EXCEEDED",
            title: `⚠️ Orçamento de ${s.categoryIcon} ${s.categoryName} estourado`,
            body: `Gasto ${formatBRL(s.spentCents)} de ${formatBRL(s.amountCents)} (${s.percent}%) em ${monthLabelBR(monthIso)}.`,
            dedupe: `budget:${s.id}:exceeded:${s.month}`,
            data: { budgetId: s.id },
          });
          alerts++;
        } else if (s.percent >= threshold) {
          await this.notifications.push({
            householdId: hid,
            type: "BUDGET_THRESHOLD",
            title: `📊 ${s.categoryIcon} ${s.categoryName}: ${s.percent}% do orçamento`,
            body: `Vocês já gastaram ${formatBRL(s.spentCents)} de ${formatBRL(s.amountCents)} em ${monthLabelBR(monthIso)}.`,
            dedupe: `budget:${s.id}:threshold:${s.month}`,
            data: { budgetId: s.id },
          });
          alerts++;
        }
      }
    }
    return { checked, alerts };
  }
}
