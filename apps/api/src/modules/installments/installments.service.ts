import { Inject, Injectable } from "@nestjs/common";
import type { InstallmentPlan, Prisma } from "@prisma/client";
import {
  splitInstallments,
  invoiceCompetence,
  clampDayToMonth,
  addMonths,
  firstDayOfMonth,
  todayIso,
  type CreateInstallmentPlanBody,
  type FutureCommitmentMonth,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { DomainError, NotFoundError } from "../../common/errors/domain-error";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { InvoicesService } from "../invoices/invoices.service";

@Injectable()
export class InstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async timezone(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    return h?.timezone ?? this.env.APP_TIMEZONE;
  }

  async list(householdId: string, opts: { creditCardId?: string; activeOnly?: boolean }) {
    return this.prisma.installmentPlan.findMany({
      where: {
        householdId,
        creditCardId: opts.creditCardId,
        ...(opts.activeOnly
          ? { installments: { some: { status: { in: ["SCHEDULED", "BILLED"] } } } }
          : {}),
      },
      include: {
        creditCard: { select: { id: true, name: true, color: true, icon: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
        member: { select: { id: true, displayName: true } },
        installments: { orderBy: { number: "asc" } },
      },
      orderBy: { purchaseDate: "desc" },
    });
  }

  async get(householdId: string, id: string) {
    const plan = await this.prisma.installmentPlan.findFirst({
      where: { id, householdId },
      include: { installments: { orderBy: { number: "asc" } } },
    });
    if (!plan) throw new NotFoundError("Plano de parcelamento");
    return plan;
  }

  async create(
    householdId: string,
    createdByMemberId: string,
    body: CreateInstallmentPlanBody,
  ): Promise<InstallmentPlan> {
    const memberId = body.memberId ?? createdByMemberId;

    const [card, member, category] = await Promise.all([
      this.prisma.creditCard.findFirst({ where: { id: body.creditCardId, householdId } }),
      this.prisma.householdMember.findFirst({ where: { id: memberId, householdId } }),
      body.categoryId
        ? this.prisma.category.findFirst({ where: { id: body.categoryId, householdId } })
        : Promise.resolve(null),
    ]);
    if (!card) throw new NotFoundError("Cartão");
    if (!member) throw new NotFoundError("Membro");
    if (body.categoryId && !category) throw new NotFoundError("Categoria");

    const tz = await this.timezone(householdId);
    const amounts = splitInstallments(body.totalCents, body.installmentCount);

    // Competência da 1ª parcela: pela data da compra (ou pela firstDueDate informada).
    const baseComp = invoiceCompetence({
      date: body.purchaseDate,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      tz,
    });
    const firstReferenceMonth = body.firstDueDate
      ? firstDayOfMonth(body.firstDueDate, tz)
      : baseComp.referenceMonth;

    return this.prisma.$transaction(
      async (tx) => {
        const plan = await tx.installmentPlan.create({
          data: {
            householdId,
            creditCardId: card.id,
            categoryId: category?.id ?? null,
            memberId,
            description: body.description,
            totalCents: body.totalCents,
            installmentCount: body.installmentCount,
            purchaseDate: dateOnly(body.purchaseDate),
            firstDueDate: dateOnly(
              body.firstDueDate ?? this.dueDateForReference(firstReferenceMonth, card, tz),
            ),
          },
        });

        const touchedInvoices = new Set<string>();

        for (let i = 0; i < body.installmentCount; i++) {
          const referenceMonth = addMonths(firstReferenceMonth, i, tz);
          const closingDate = clampDayToMonth(referenceMonth, card.closingDay, tz);
          const dueDate = this.dueDateForReference(referenceMonth, card, tz);

          const invoice = await tx.creditCardInvoice.upsert({
            where: {
              creditCardId_referenceMonth: {
                creditCardId: card.id,
                referenceMonth: dateOnly(referenceMonth),
              },
            },
            update: {},
            create: {
              creditCardId: card.id,
              referenceMonth: dateOnly(referenceMonth),
              closingDate: dateOnly(closingDate),
              dueDate: dateOnly(dueDate),
              status: "OPEN",
            },
          });
          touchedInvoices.add(invoice.id);

          const installment = await tx.installment.create({
            data: {
              planId: plan.id,
              number: i + 1,
              amountCents: amounts[i]!,
              dueDate: dateOnly(dueDate),
              status: "SCHEDULED",
              invoiceId: invoice.id,
            },
          });

          const transaction = await tx.transaction.create({
            data: {
              householdId,
              type: "EXPENSE",
              amountCents: amounts[i]!,
              description: `${body.description} (${i + 1}/${body.installmentCount})`,
              date: dateOnly(dueDate),
              status: "PENDING",
              source: "MANUAL",
              categoryId: category?.id ?? null,
              creditCardId: card.id,
              invoiceId: invoice.id,
              installmentId: installment.id,
              memberId,
              createdById: createdByMemberId,
            },
          });

          await tx.installment.update({
            where: { id: installment.id },
            data: { transactionId: transaction.id },
          });
        }

        for (const invId of touchedInvoices) await this.invoices.recalcTotal(invId, tx);
        return plan;
      },
      { timeout: 30000 },
    );
  }

  private dueDateForReference(
    referenceMonthIso: string,
    card: { closingDay: number; dueDay: number },
    tz: string,
  ): string {
    const anchor =
      card.dueDay > card.closingDay ? referenceMonthIso : addMonths(referenceMonthIso, 1, tz);
    return clampDayToMonth(anchor, card.dueDay, tz);
  }

  /** Cancela o plano: marca parcelas como CANCELED e remove as transações ainda PENDING. */
  async cancel(householdId: string, id: string): Promise<{ canceled: true }> {
    const plan = await this.get(householdId, id);
    const hasBilledOrPaid = plan.installments.some((i) => i.status === "PAID");
    if (hasBilledOrPaid) {
      throw new DomainError("Não é possível cancelar: há parcelas já pagas.");
    }

    await this.prisma.$transaction(async (tx) => {
      const invoiceIds = new Set<string>();
      for (const inst of plan.installments) {
        if (inst.invoiceId) invoiceIds.add(inst.invoiceId);
        if (inst.transactionId) {
          await tx.transaction.deleteMany({
            where: { id: inst.transactionId, status: "PENDING" },
          });
        }
      }
      await tx.installment.updateMany({
        where: { planId: plan.id },
        data: { status: "CANCELED", transactionId: null },
      });
      for (const invId of invoiceIds) await this.invoices.recalcTotal(invId, tx);
    });

    return { canceled: true };
  }

  /** "Quanto já estou comprometido nos próximos meses?" — soma de parcelas futuras por mês. */
  async futureCommitment(householdId: string, months: number): Promise<FutureCommitmentMonth[]> {
    const tz = await this.timezone(householdId);
    const from = firstDayOfMonth(todayIso(tz), tz);
    const to = addMonths(from, months, tz);

    const installments = await this.prisma.installment.findMany({
      where: {
        plan: { householdId },
        status: { in: ["SCHEDULED", "BILLED"] },
        dueDate: { gte: dateOnly(from), lt: dateOnly(to) },
      },
      select: { amountCents: true, dueDate: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < months; i++) buckets.set(addMonths(from, i, tz), 0);
    for (const inst of installments) {
      const key = firstDayOfMonth(toIsoDate(inst.dueDate), tz);
      buckets.set(key, (buckets.get(key) ?? 0) + inst.amountCents);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cents]) => ({ month, cents }));
  }
}
