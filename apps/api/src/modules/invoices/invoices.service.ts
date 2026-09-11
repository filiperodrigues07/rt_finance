import { Inject, Injectable } from "@nestjs/common";
import type { CreditCard, CreditCardInvoice, Prisma } from "@prisma/client";
import {
  invoiceCompetence,
  monthLabelBR,
  todayIso,
  type AdjustInvoiceBody,
  type InvoiceDetail,
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

  /**
   * Recalcula o total (cache) de uma fatura: saldo inicial (não detalhado) + soma das transações
   * associadas COM SINAL (EXPENSE − INCOME). Ignora canceladas. A soma com sinal também corrige
   * estornos/`INCOME` no cartão, que antes aumentavam a fatura.
   */
  async recalcTotal(invoiceId: string, db: Db = this.prisma): Promise<number> {
    const [inv, byType] = await Promise.all([
      db.creditCardInvoice.findUnique({
        where: { id: invoiceId },
        select: { openingBalanceCents: true },
      }),
      db.transaction.groupBy({
        by: ["type"],
        where: { invoiceId, status: { not: "CANCELED" } },
        _sum: { amountCents: true },
        orderBy: { type: "asc" },
      }),
    ]);
    const s = (t: "EXPENSE" | "INCOME") =>
      byType.find((r) => r.type === t)?._sum.amountCents ?? 0;
    const totalCents = (inv?.openingBalanceCents ?? 0) + s("EXPENSE") - s("INCOME");
    await db.creditCardInvoice.update({ where: { id: invoiceId }, data: { totalCents } });
    return totalCents;
  }

  /**
   * Quando o saldo inicial de UMA fatura sobe, essa dívida deixa de ser "geral" e passa a
   * ser daquela fatura específica — então tira o mesmo tanto do "Limite já utilizado" do
   * cartão (dívida geral, fora de qualquer fatura). Sem isso, a mesma dívida pré-existente
   * conta duas vezes no limite usado (cartão inteiro + dentro da fatura).
   */
  private async shiftCardOpeningUsed(
    creditCardId: string,
    increaseCents: number,
    db: Db = this.prisma,
  ): Promise<void> {
    if (increaseCents <= 0) return;
    const card = await db.creditCard.findUnique({
      where: { id: creditCardId },
      select: { openingUsedCents: true },
    });
    if (!card || card.openingUsedCents <= 0) return;
    const shift = Math.min(card.openingUsedCents, increaseCents);
    if (shift <= 0) return;
    await db.creditCard.update({
      where: { id: creditCardId },
      data: { openingUsedCents: { decrement: shift } },
    });
  }

  /** Ajusta saldo inicial (não detalhado) e/ou o valor real da fatura para conferência. */
  async patch(
    householdId: string,
    invoiceId: string,
    body: { openingBalanceCents?: number; statementTotalCents?: number | null },
  ): Promise<CreditCardInvoice> {
    const current = await this.get(householdId, invoiceId);
    await this.prisma.$transaction(async (tx) => {
      await tx.creditCardInvoice.update({
        where: { id: invoiceId },
        data: {
          openingBalanceCents: body.openingBalanceCents,
          statementTotalCents:
            body.statementTotalCents === undefined ? undefined : body.statementTotalCents,
        },
      });
      if (body.openingBalanceCents !== undefined) {
        const increase = body.openingBalanceCents - current.openingBalanceCents;
        await this.shiftCardOpeningUsed(current.creditCardId, increase, tx);
        await this.recalcTotal(invoiceId, tx);
      }
    });
    return this.get(householdId, invoiceId);
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

  /**
   * Quita em massa as faturas de meses ANTERIORES de um cartão, sem debitar conta — para o
   * onboarding de quem começou a usar o app com fatura já rodando. As parcelas PENDING dessas
   * faturas viram CLEARED (gasto histórico real, saem de "a pagar").
   */
  async settlePast(
    householdId: string,
    cardId: string,
    opts: { throughMonth?: string } = {},
  ): Promise<{ settled: number }> {
    const card = await this.prisma.creditCard.findFirst({ where: { id: cardId, householdId } });
    if (!card) throw new NotFoundError("Cartão");

    const tz = await this.timezone(householdId);
    const comp = invoiceCompetence({
      date: todayIso(tz),
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      tz,
    });
    const cutoff = dateOnly(opts.throughMonth ?? comp.referenceMonth);

    const invoices = await this.prisma.creditCardInvoice.findMany({
      where: { creditCardId: card.id, status: { not: "PAID" }, referenceMonth: { lt: cutoff } },
      select: { id: true, dueDate: true },
    });

    for (const inv of invoices) {
      await this.prisma.$transaction(async (tx) => {
        await tx.transaction.updateMany({
          where: { invoiceId: inv.id, status: "PENDING" },
          data: { status: "CLEARED", paidAt: inv.dueDate },
        });
        await tx.installment.updateMany({
          where: { invoiceId: inv.id, status: { in: ["SCHEDULED", "BILLED"] } },
          data: { status: "PAID" },
        });
        await tx.creditCardInvoice.update({
          where: { id: inv.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        await this.recalcTotal(inv.id, tx);
      });
    }
    return { settled: invoices.length };
  }

  /** Fatura + lançamentos + breakdown para a tela de conciliação. */
  async detail(householdId: string, invoiceId: string): Promise<InvoiceDetail> {
    const invoice = await this.prisma.creditCardInvoice.findFirst({
      where: { id: invoiceId, creditCard: { householdId } },
      include: {
        creditCard: { select: { openingUsedCents: true } },
        transactions: {
          where: { status: { not: "CANCELED" } },
          orderBy: { date: "asc" },
          select: {
            id: true,
            type: true,
            amountCents: true,
            description: true,
            date: true,
            categoryId: true,
            source: true,
          },
        },
      },
    });
    if (!invoice) throw new NotFoundError("Fatura");

    const signed = (t: { type: string; amountCents: number }) =>
      t.type === "INCOME" ? -t.amountCents : t.amountCents;
    const adj = invoice.transactions.filter((t) => t.source === "ADJUSTMENT");
    const items = invoice.transactions.filter((t) => t.source !== "ADJUSTMENT");
    const itemizedCents = items.reduce((a, t) => a + signed(t), 0);
    const adjustmentsCents = adj.reduce((a, t) => a + signed(t), 0);
    const totalCents = invoice.totalCents;
    const diffCents = (invoice.statementTotalCents ?? totalCents) - totalCents;

    return {
      id: invoice.id,
      creditCardId: invoice.creditCardId,
      referenceMonth: toIsoDate(invoice.referenceMonth),
      closingDate: toIsoDate(invoice.closingDate),
      dueDate: toIsoDate(invoice.dueDate),
      status: invoice.status,
      totalCents,
      openingBalanceCents: invoice.openingBalanceCents,
      cardOpeningUsedCents: invoice.creditCard.openingUsedCents,
      itemizedCents,
      adjustmentsCents,
      statementTotalCents: invoice.statementTotalCents,
      diffCents,
      reconciledAt: invoice.reconciledAt ? invoice.reconciledAt.toISOString() : null,
      adjustments: adj.map((t) => ({
        id: t.id,
        description: t.description,
        amountCents: signed(t),
        date: toIsoDate(t.date),
        categoryId: t.categoryId,
      })),
    };
  }

  /** Conciliação: joga a diferença no saldo inicial, ou cria um lançamento de ajuste na fatura. */
  async adjust(
    householdId: string,
    invoiceId: string,
    actingMemberId: string,
    body: AdjustInvoiceBody,
  ): Promise<InvoiceDetail> {
    const invoice = await this.get(householdId, invoiceId);
    const before = await this.detail(householdId, invoiceId);
    const amount = body.amountCents ?? before.diffCents;
    if (!amount) throw new DomainError("Não há diferença para ajustar");

    if (body.mode === "opening") {
      const next = Math.max(0, invoice.openingBalanceCents + amount);
      await this.prisma.$transaction(async (tx) => {
        await tx.creditCardInvoice.update({
          where: { id: invoiceId },
          data: { openingBalanceCents: next },
        });
        await this.shiftCardOpeningUsed(invoice.creditCardId, next - invoice.openingBalanceCents, tx);
        await this.recalcTotal(invoiceId, tx);
      });
    } else {
      const tz = await this.timezone(householdId);
      await this.prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            householdId,
            type: amount > 0 ? "EXPENSE" : "INCOME",
            amountCents: Math.abs(amount),
            description: body.description?.trim() || "Ajuste de fatura",
            date: dateOnly(todayIso(tz)),
            status: "CONFIRMED",
            source: "ADJUSTMENT",
            categoryId: body.categoryId ?? null,
            creditCardId: invoice.creditCardId,
            invoiceId,
            memberId: actingMemberId,
            createdById: actingMemberId,
          },
        });
        await this.recalcTotal(invoiceId, tx);
      });
    }
    return this.detail(householdId, invoiceId);
  }

  /** Remove um lançamento de ajuste (source ADJUSTMENT) e recalcula a fatura. */
  async unadjust(householdId: string, txId: string): Promise<{ removed: true }> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: txId, source: "ADJUSTMENT", invoice: { creditCard: { householdId } } },
      select: { id: true, invoiceId: true },
    });
    if (!tx?.invoiceId) throw new NotFoundError("Ajuste");
    await this.prisma.transaction.delete({ where: { id: tx.id } });
    await this.recalcTotal(tx.invoiceId);
    return { removed: true };
  }

  /** Marca a fatura como conferida; se não houver valor real informado, adota o total do app. */
  async markReconciled(householdId: string, invoiceId: string): Promise<CreditCardInvoice> {
    const invoice = await this.get(householdId, invoiceId);
    return this.prisma.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        reconciledAt: new Date(),
        statementTotalCents: invoice.statementTotalCents ?? invoice.totalCents,
      },
    });
  }
}
