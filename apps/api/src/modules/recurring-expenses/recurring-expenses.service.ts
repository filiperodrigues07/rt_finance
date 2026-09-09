import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma, RecurringExpense } from "@prisma/client";
import {
  addDays,
  addMonths,
  clampDayToMonth,
  firstDayOfMonth,
  todayIso,
  type CreateRecurringBody,
  type UpdateRecurringBody,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { DomainError, NotFoundError } from "../../common/errors/domain-error";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { InvoicesService } from "../invoices/invoices.service";

@Injectable()
export class RecurringExpensesService {
  private readonly logger = new Logger(RecurringExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async tz(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    return h?.timezone ?? this.env.APP_TIMEZONE;
  }

  async list(householdId: string) {
    return this.prisma.recurringExpense.findMany({
      where: { householdId },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        member: { select: { id: true, displayName: true } },
        _count: { select: { runs: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  }

  async get(householdId: string, id: string): Promise<RecurringExpense> {
    const r = await this.prisma.recurringExpense.findFirst({ where: { id, householdId } });
    if (!r) throw new NotFoundError("Recorrência");
    return r;
  }

  async create(householdId: string, createdByMemberId: string, body: CreateRecurringBody) {
    const memberId = body.memberId ?? createdByMemberId;
    await this.assertRefs(householdId, {
      categoryId: body.categoryId,
      memberId,
      accountId: body.accountId ?? null,
      creditCardId: body.creditCardId ?? null,
    });
    return this.prisma.recurringExpense.create({
      data: {
        householdId,
        name: body.name,
        amountCents: body.amountCents ?? null,
        categoryId: body.categoryId,
        memberId,
        frequency: body.frequency,
        interval: body.interval,
        dayOfMonth: body.dayOfMonth ?? null,
        weekday: body.weekday ?? null,
        occurrenceCount: body.occurrenceCount ?? null,
        autoPost: body.autoPost,
        accountId: body.accountId ?? null,
        creditCardId: body.creditCardId ?? null,
        startDate: dateOnly(body.startDate),
        endDate: body.endDate ? dateOnly(body.endDate) : null,
      },
    });
  }

  async update(householdId: string, id: string, body: UpdateRecurringBody) {
    const current = await this.get(householdId, id);
    return this.prisma.recurringExpense.update({
      where: { id: current.id },
      data: {
        name: body.name,
        amountCents: body.amountCents,
        categoryId: body.categoryId,
        memberId: body.memberId,
        frequency: body.frequency,
        interval: body.interval,
        dayOfMonth: body.dayOfMonth,
        weekday: body.weekday,
        occurrenceCount: body.occurrenceCount,
        autoPost: body.autoPost,
        accountId: body.accountId,
        creditCardId: body.creditCardId,
        endDate: body.endDate ? dateOnly(body.endDate) : body.endDate === null ? null : undefined,
        active: body.active,
      },
    });
  }

  async remove(householdId: string, id: string) {
    const current = await this.get(householdId, id);
    await this.prisma.recurringExpense.update({
      where: { id: current.id },
      data: { active: false },
    });
    return { deactivated: true };
  }

  private async assertRefs(
    householdId: string,
    refs: { categoryId: string; memberId: string; accountId: string | null; creditCardId: string | null },
  ) {
    const [cat, mem, acc, card] = await Promise.all([
      this.prisma.category.findFirst({ where: { id: refs.categoryId, householdId } }),
      this.prisma.householdMember.findFirst({ where: { id: refs.memberId, householdId } }),
      refs.accountId
        ? this.prisma.account.findFirst({ where: { id: refs.accountId, householdId } })
        : Promise.resolve(true),
      refs.creditCardId
        ? this.prisma.creditCard.findFirst({ where: { id: refs.creditCardId, householdId } })
        : Promise.resolve(true),
    ]);
    if (!cat) throw new NotFoundError("Categoria");
    if (!mem) throw new NotFoundError("Membro");
    if (!acc) throw new NotFoundError("Conta");
    if (!card) throw new NotFoundError("Cartão");
    if (!refs.accountId && !refs.creditCardId) {
      throw new DomainError("Informe uma conta ou um cartão para a recorrência");
    }
  }

  /** Datas de ocorrência entre `fromExclusive` e `toInclusive`. */
  private occurrences(r: RecurringExpense, fromIso: string, toIso: string, tz: string): string[] {
    const out: string[] = [];
    const start = toIsoDate(r.startDate);
    const cursorStartIso = fromIso < start ? start : fromIso;

    if (r.frequency === "MONTHLY" || r.frequency === "YEARLY") {
      const stepMonths = r.frequency === "YEARLY" ? 12 * r.interval : r.interval;
      let monthAnchor = firstDayOfMonth(cursorStartIso, tz);
      // alinha o primeiro anchor ao ciclo a partir de startDate
      for (let guard = 0; guard < 600; guard++) {
        const day = r.dayOfMonth ?? new Date(r.startDate).getUTCDate();
        const occ = clampDayToMonth(monthAnchor, day, tz);
        if (occ > toIso) break;
        if (occ >= cursorStartIso && occ >= start) {
          if (!r.endDate || occ <= toIsoDate(r.endDate)) out.push(occ);
        }
        monthAnchor = addMonths(monthAnchor, stepMonths, tz);
      }
    } else {
      // WEEKLY
      let d = start;
      const target = r.weekday ?? new Date(r.startDate).getUTCDay();
      // avança até o primeiro weekday alvo >= start
      for (let i = 0; i < 7; i++) {
        if (new Date(`${d}T00:00:00Z`).getUTCDay() === target) break;
        d = addDays(d, 1, tz);
      }
      for (let guard = 0; guard < 400; guard++) {
        if (d > toIso) break;
        if (d >= cursorStartIso && (!r.endDate || d <= toIsoDate(r.endDate))) out.push(d);
        d = addDays(d, 7 * r.interval, tz);
      }
    }
    return out;
  }

  /** Gera lançamentos das recorrências ativas dentro do horizonte. Idempotente (RecurringRun). */
  async generateDue(householdId?: string): Promise<{ created: number }> {
    const horizon = this.env.RECURRING_HORIZON_MONTHS;
    const recs = await this.prisma.recurringExpense.findMany({
      where: { active: true, ...(householdId ? { householdId } : {}) },
    });

    let created = 0;
    for (const r of recs) {
      const tz = await this.tz(r.householdId);
      const from = r.lastGeneratedDate
        ? addDays(toIsoDate(r.lastGeneratedDate), 1, tz)
        : toIsoDate(r.startDate);

      // Nº fixo de lançamentos: gera tudo o que falta agora (ignora o horizonte) e encerra ao completar.
      const done =
        r.occurrenceCount != null
          ? await this.prisma.recurringRun.count({ where: { recurringExpenseId: r.id } })
          : 0;
      if (r.occurrenceCount != null && done >= r.occurrenceCount) {
        if (r.active) {
          await this.prisma.recurringExpense.update({ where: { id: r.id }, data: { active: false } });
        }
        continue;
      }

      let to = addMonths(todayIso(tz), horizon, tz);
      if (r.occurrenceCount != null) {
        const need = r.occurrenceCount - done + 2;
        const stepMonths =
          r.frequency === "YEARLY" ? 12 * r.interval : r.frequency === "MONTHLY" ? r.interval : 0;
        const far =
          stepMonths > 0
            ? addMonths(from, need * stepMonths, tz)
            : addDays(from, need * 7 * r.interval, tz);
        if (far > to) to = far;
      }

      let occ = this.occurrences(r, from, to, tz);
      if (r.occurrenceCount != null) {
        occ = occ.slice(0, Math.max(0, r.occurrenceCount - done));
      }
      if (occ.length === 0) continue;

      let madeForRec = 0;
      for (const dateIso of occ) {
        const period = dateOnly(
          r.frequency === "WEEKLY" ? dateIso : firstDayOfMonth(dateIso, tz),
        );
        const exists = await this.prisma.recurringRun.findUnique({
          where: { recurringExpenseId_period: { recurringExpenseId: r.id, period } },
        });
        if (exists) {
          madeForRec++;
          continue;
        }

        if (r.amountCents == null) {
          // valor variável: registra a ocorrência sem transação (será preenchida manualmente)
          await this.prisma.recurringRun.create({
            data: { recurringExpenseId: r.id, period, transactionId: null },
          });
          created++;
          madeForRec++;
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          let invoiceId: string | null = null;
          if (r.creditCardId) {
            const card = await tx.creditCard.findUnique({ where: { id: r.creditCardId } });
            if (card) {
              const inv = await this.invoices.resolveInvoiceForDate(
                r.householdId,
                card,
                dateIso,
                tx,
              );
              invoiceId = inv.id;
            }
          }
          const trx = await tx.transaction.create({
            data: {
              householdId: r.householdId,
              type: "EXPENSE",
              amountCents: r.amountCents!,
              description: r.name,
              date: dateOnly(dateIso),
              // autoPost false → conta a pagar de verdade (com vencimento)
              dueDate: r.autoPost ? null : dateOnly(dateIso),
              status: r.autoPost ? "CONFIRMED" : "PENDING",
              source: "RECURRING",
              categoryId: r.categoryId,
              accountId: r.accountId,
              creditCardId: r.creditCardId,
              invoiceId,
              recurringExpenseId: r.id,
              memberId: r.memberId,
              createdById: r.memberId,
            },
          });
          await tx.recurringRun.create({
            data: { recurringExpenseId: r.id, period, transactionId: trx.id },
          });
          if (invoiceId) await this.invoices.recalcTotal(invoiceId, tx);
        });
        created++;
        madeForRec++;
      }

      const completed = r.occurrenceCount != null && done + madeForRec >= r.occurrenceCount;
      await this.prisma.recurringExpense.update({
        where: { id: r.id },
        data: {
          lastGeneratedDate: dateOnly(occ[occ.length - 1]!),
          ...(completed ? { active: false } : {}),
        },
      });
    }
    this.logger.log(`recorrências geradas: ${created}`);
    return { created };
  }
}
