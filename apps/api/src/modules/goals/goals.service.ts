import { Injectable } from "@nestjs/common";
import {
  GOAL_MILESTONES,
  percentOf,
  formatBRL,
  todayIso,
  type CreateGoalBody,
  type UpdateGoalBody,
  type AddContributionBody,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { NotFoundError } from "../../common/errors/domain-error";
import { dateOnly } from "../../common/date-only";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list(householdId: string) {
    return this.prisma.financialGoal.findMany({
      where: { householdId },
      include: {
        contributions: {
          orderBy: { date: "desc" },
          take: 10,
          include: { member: { select: { displayName: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(householdId: string, id: string) {
    const g = await this.prisma.financialGoal.findFirst({
      where: { id, householdId },
      include: { contributions: { orderBy: { date: "desc" } } },
    });
    if (!g) throw new NotFoundError("Meta");
    return g;
  }

  create(householdId: string, body: CreateGoalBody) {
    return this.prisma.financialGoal.create({
      data: {
        householdId,
        name: body.name,
        targetCents: body.targetCents,
        deadline: body.deadline ? dateOnly(body.deadline) : null,
        icon: body.icon,
        color: body.color,
        autoContributeCents: body.autoContributeCents ?? null,
        autoContributeDay: body.autoContributeDay ?? null,
        autoFromAccountId: body.autoFromAccountId ?? null,
      },
    });
  }

  async update(householdId: string, id: string, body: UpdateGoalBody) {
    const g = await this.prisma.financialGoal.findFirst({ where: { id, householdId } });
    if (!g) throw new NotFoundError("Meta");
    return this.prisma.financialGoal.update({
      where: { id },
      data: {
        name: body.name,
        targetCents: body.targetCents,
        deadline: body.deadline ? dateOnly(body.deadline) : body.deadline === null ? null : undefined,
        icon: body.icon,
        color: body.color,
        status: body.status,
        autoContributeCents:
          body.autoContributeCents === undefined ? undefined : body.autoContributeCents,
        autoContributeDay:
          body.autoContributeDay === undefined ? undefined : body.autoContributeDay,
        autoFromAccountId:
          body.autoFromAccountId === undefined ? undefined : body.autoFromAccountId,
      },
    });
  }

  /**
   * Aporte automático mensal (chamado pelo scheduler). Idempotente por mês via nota
   * "auto:YYYY-MM". Debita a conta escolhida, se houver.
   */
  async runAutoContributions(): Promise<{ created: number }> {
    const goals = await this.prisma.financialGoal.findMany({
      where: { status: "ACTIVE", autoContributeCents: { not: null }, autoContributeDay: { not: null } },
      include: { household: { select: { timezone: true } } },
    });
    let created = 0;
    for (const g of goals) {
      const tz = g.household.timezone ?? "America/Sao_Paulo";
      const today = todayIso(tz);
      const day = Number(today.slice(8, 10));
      if (day !== g.autoContributeDay) continue;
      const ym = today.slice(0, 7);
      const note = `auto:${ym}`;

      const exists = await this.prisma.goalContribution.findFirst({
        where: { goalId: g.id, note },
        select: { id: true },
      });
      if (exists) continue;

      const owner = await this.prisma.householdMember.findFirst({
        where: { householdId: g.householdId, role: "OWNER" },
        select: { id: true },
      });
      const amount = g.autoContributeCents!;
      await this.prisma.$transaction(async (tx) => {
        await tx.goalContribution.create({
          data: {
            goalId: g.id,
            memberId: owner!.id,
            amountCents: amount,
            date: dateOnly(today),
            note,
          },
        });
        await tx.financialGoal.update({
          where: { id: g.id },
          data: {
            currentCents: { increment: amount },
            status: g.currentCents + amount >= g.targetCents ? "ACHIEVED" : g.status,
          },
        });
        if (g.autoFromAccountId) {
          await tx.transaction.create({
            data: {
              householdId: g.householdId,
              type: "EXPENSE",
              amountCents: amount,
              description: `Aporte automático: ${g.name}`,
              date: dateOnly(today),
              paidAt: new Date(),
              status: "CONFIRMED",
              source: "MANUAL",
              accountId: g.autoFromAccountId,
              categoryId: null,
              memberId: owner!.id,
              createdById: owner!.id,
            },
          });
        }
      });
      created++;
    }
    return { created };
  }

  async remove(householdId: string, id: string) {
    const g = await this.prisma.financialGoal.findFirst({ where: { id, householdId } });
    if (!g) throw new NotFoundError("Meta");
    await this.prisma.financialGoal.delete({ where: { id } });
    return { deleted: true };
  }

  async addContribution(
    householdId: string,
    goalId: string,
    memberFallbackId: string,
    body: AddContributionBody,
  ) {
    const goal = await this.prisma.financialGoal.findFirst({ where: { id: goalId, householdId } });
    if (!goal) throw new NotFoundError("Meta");
    const memberId = body.memberId ?? memberFallbackId;

    const before = goal.currentCents;
    const after = before + body.amountCents;

    const [contribution, updated] = await this.prisma.$transaction([
      this.prisma.goalContribution.create({
        data: {
          goalId,
          memberId,
          amountCents: body.amountCents,
          date: dateOnly(body.date),
          note: body.note ?? null,
        },
      }),
      this.prisma.financialGoal.update({
        where: { id: goalId },
        data: {
          currentCents: after,
          status: after >= goal.targetCents ? "ACHIEVED" : goal.status,
        },
      }),
    ]);

    // Milestones cruzados nesta contribuição
    const pctBefore = percentOf(before, goal.targetCents);
    const pctAfter = percentOf(after, goal.targetCents);
    for (const m of GOAL_MILESTONES) {
      if (pctBefore < m && pctAfter >= m) {
        await this.notifications.push({
          householdId,
          type: "GOAL_MILESTONE",
          title: `${goal.icon} Meta "${goal.name}": ${m}%`,
          body:
            m === 100
              ? `Vocês atingiram a meta! ${formatBRL(after)} de ${formatBRL(goal.targetCents)}. 🎉`
              : `Já são ${formatBRL(after)} de ${formatBRL(goal.targetCents)} (${pctAfter}%).`,
          dedupe: `goal:${goal.id}:milestone:${m}`,
          data: { goalId: goal.id, milestone: m },
        });
      }
    }

    return { contribution, goal: updated };
  }

  async removeContribution(householdId: string, goalId: string, contributionId: string) {
    const c = await this.prisma.goalContribution.findFirst({
      where: { id: contributionId, goalId, goal: { householdId } },
    });
    if (!c) throw new NotFoundError("Aporte");
    await this.prisma.$transaction([
      this.prisma.goalContribution.delete({ where: { id: contributionId } }),
      this.prisma.financialGoal.update({
        where: { id: goalId },
        data: { currentCents: { decrement: c.amountCents } },
      }),
    ]);
    return { deleted: true };
  }
}
