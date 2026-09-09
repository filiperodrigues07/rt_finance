import { Inject, Injectable } from "@nestjs/common";
import type { CreditCard, CreditCardInvoice, Prisma } from "@prisma/client";
import {
  invoiceCompetence,
  monthLabelBR,
  todayIso,
  type PayInvoiceBody,
  type PayInvoiceResult,
  type PayableInvoice,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { ConflictError, DomainError, NotFoundError } from "../../common/errors/domain-error";
import { dateOnly, toIsoDate } from "../../common/date-only";

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InvoicesService {
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

  /**
   * Encontra (ou cria) a fatura cuja competência contém a data informada (doc 02 §4.3).
   * Pode rodar dentro de uma transação Prisma passando `db`.
   */
  async resolveInvoiceForDate(
    householdId: string,
    card: CreditCard,
    dateIso: string,
    db: Db = this.prisma,
  ): Promise<CreditCardInvoice> {
    const tz = await this.timezone(householdId);
    const comp = invoiceCompetence({
      date: dateIso,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      tz,
    });

    return db.creditCardInvoice.upsert({
      where: {
        creditCardId_referenceMonth: {
          creditCardId: card.id,
          referenceMonth: dateOnly(comp.referenceMonth),
        },
      },
      update: {},
      create: {
        creditCardId: card.id,
        referenceMonth: dateOnly(comp.referenceMonth),
        closingDate: dateOnly(comp.closingDate),
        dueDate: dateOnly(comp.dueDate),
        status: "OPEN",
      },
    });
  }

  /** Recalcula o total (cache) de uma fatura a partir das transações associadas. */
  async recalcTotal(invoiceId: string, db: Db = this.prisma): Promise<number> {
    const agg = await db.transaction.aggregate({
      where: { invoiceId, status: { not: "CANCELED" } },
      _sum: { amountCents: true },
    });
    const totalCents = agg._sum.amountCents ?? 0;
    await db.creditCardInvoice.update({ where: { id: invoiceId }, data: { totalCents } });
    return totalCents;
  }

  async listForCard(householdId: string, cardId: string): Promise<CreditCardInvoice[]> {
    const card = await this.prisma.creditCard.findFirst({ where: { id: cardId, householdId } });
    if (!card) throw new NotFoundError("Cartão");
    return this.prisma.creditCardInvoice.findMany({
      where: { creditCardId: cardId },
      orderBy: { referenceMonth: "desc" },
    });
  }

  async get(householdId: string, invoiceId: string): Promise<CreditCardInvoice> {
    const invoice = await this.prisma.creditCardInvoice.findFirst({
      where: { id: invoiceId, creditCard: { householdId } },
    });
    if (!invoice) throw new NotFoundError("Fatura");
    return invoice;
  }

  /** Faturas em aberto de qualquer cartão do household — para o seletor "pagar fatura". */
  async listPayable(householdId: string): Promise<PayableInvoice[]> {
    const rows = await this.prisma.creditCardInvoice.findMany({
      where: {
        creditCard: { householdId },
        paidAt: null,
        status: { in: ["OPEN", "CLOSED", "OVERDUE"] },
      },
      include: { creditCard: { select: { name: true, color: true, icon: true } } },
      orderBy: { dueDate: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      creditCardId: r.creditCardId,
      card: { name: r.creditCard.name, color: r.creditCard.color, icon: r.creditCard.icon },
      referenceMonth: toIsoDate(r.referenceMonth),
      dueDate: toIsoDate(r.dueDate),
      status: r.status,
      totalCents: r.totalCents,
    }));
  }

  /**
   * Paga uma fatura: cria uma despesa na conta escolhida (debita o saldo), marca a
   * fatura como PAID e libera o limite do cartão (o cálculo de limite ignora faturas
   * pagas). As parcelas da fatura viram PAID.
   */
  async pay(
    householdId: string,
    invoiceId: string,
    actingMemberId: string,
    body: PayInvoiceBody,
  ): Promise<PayInvoiceResult> {
    const invoice = await this.get(householdId, invoiceId);
    if (invoice.status === "PAID") throw new ConflictError("Fatura já paga");

    const account = await this.prisma.account.findFirst({
      where: { id: body.accountId, householdId },
      select: { id: true },
    });
    if (!account) throw new NotFoundError("Conta");

    const card = await this.prisma.creditCard.findUnique({
      where: { id: invoice.creditCardId },
      select: { name: true },
    });
    const tz = await this.timezone(householdId);
    const dateIso = body.date ?? todayIso(tz);

    return this.prisma.$transaction(async (tx) => {
      const total = await this.recalcTotal(invoiceId, tx);
      if (total <= 0) throw new DomainError("Fatura sem valor a pagar");

      const payTx = await tx.transaction.create({
        data: {
          householdId,
          type: "EXPENSE",
          amountCents: total,
          description: `Pagamento fatura ${card?.name ?? "cartão"} · ${monthLabelBR(toIsoDate(invoice.referenceMonth))}`,
          date: dateOnly(dateIso),
          paidAt: new Date(),
          status: "CONFIRMED",
          source: "MANUAL",
          accountId: body.accountId,
          categoryId: null,
          memberId: actingMemberId,
          createdById: actingMemberId,
        },
      });

      await tx.creditCardInvoice.update({
        where: { id: invoiceId },
        data: { status: "PAID", paidAt: new Date(), paymentTransactionId: payTx.id },
      });
      await tx.installment.updateMany({
        where: { invoiceId, status: { in: ["SCHEDULED", "BILLED"] } },
        data: { status: "PAID" },
      });

      return { invoiceId, paymentTransactionId: payTx.id, amountCents: total };
    });
  }

  /**
   * Fecha faturas cuja data de fechamento já passou e marca como OVERDUE as fechadas
   * e não pagas cujo vencimento passou. Idempotente.
   */
  async closeDue(householdId?: string): Promise<{ closed: number; overdue: number }> {
    const scopes = householdId
      ? [{ id: householdId, timezone: this.env.APP_TIMEZONE }]
      : await this.prisma.household.findMany({ select: { id: true, timezone: true } });

    let closed = 0;
    let overdue = 0;

    for (const h of scopes) {
      const today = todayIso(h.timezone ?? this.env.APP_TIMEZONE);

      const toClose = await this.prisma.creditCardInvoice.findMany({
        where: { creditCard: { householdId: h.id }, status: "OPEN", closingDate: { lte: dateOnly(today) } },
      });
      for (const inv of toClose) {
        await this.prisma.$transaction(async (tx) => {
          const total = await this.recalcTotal(inv.id, tx);
          await tx.creditCardInvoice.update({ where: { id: inv.id }, data: { status: "CLOSED" } });
          await tx.installment.updateMany({
            where: { invoiceId: inv.id, status: "SCHEDULED" },
            data: { status: "BILLED" },
          });
          void total;
        });
        closed++;
      }

      const res = await this.prisma.creditCardInvoice.updateMany({
        where: {
          creditCard: { householdId: h.id },
          status: "CLOSED",
          paidAt: null,
          dueDate: { lt: dateOnly(today) },
        },
        data: { status: "OVERDUE" },
      });
      overdue += res.count;
    }
    return { closed, overdue };
  }
}
