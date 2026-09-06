import { Inject, Injectable } from "@nestjs/common";
import {
  resolvePeriod,
  formatBRL,
  formatDateBR,
  monthLabelBR,
  type QueryRequest,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { ReportsService } from "../reports/reports.service";
import { InstallmentsService } from "../installments/installments.service";
import { CreditCardsService } from "../credit-cards/credit-cards.service";
import { monthSummary } from "../whatsapp/formatters";

@Injectable()
export class QueryExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly installments: InstallmentsService,
    private readonly cards: CreditCardsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async tz(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    return h?.timezone ?? this.env.APP_TIMEZONE;
  }

  /** Resolve a janela de datas do QueryRequest. */
  private async range(householdId: string, q: QueryRequest) {
    const tz = await this.tz(householdId);
    return resolvePeriod(q.params.period, {
      from: q.params.from,
      to: q.params.to,
      tz,
    });
  }

  private periodLabel(q: QueryRequest, fromIso: string): string {
    if (q.params.period === "THIS_YEAR") return "este ano";
    if (q.params.period === "LAST_MONTH") return "no mês passado";
    if (q.params.period === "CUSTOM") return "no período";
    return `em ${monthLabelBR(fromIso)}`;
  }

  /** Executa o template e devolve o texto final em pt-BR. */
  async run(
    householdId: string,
    q: QueryRequest,
    resolved: { categoryId?: string | null; memberId?: string | null; creditCardId?: string | null },
  ): Promise<string> {
    switch (q.template) {
      case "MONTHLY_SUMMARY": {
        const r = await this.range(householdId, q);
        const report = await this.reports.dashboard(householdId, { from: r.from, to: r.to });
        return monthSummary(report);
      }

      case "SPEND_BY_PERIOD": {
        const r = await this.range(householdId, q);
        const agg = await this.prisma.transaction.aggregate({
          where: {
            householdId,
            type: "EXPENSE",
            status: { not: "CANCELED" },
            transferGroupId: null,
            date: { gte: dateOnly(r.from), lte: dateOnly(r.to) },
          },
          _sum: { amountCents: true },
        });
        return `💸 Vocês gastaram ${formatBRL(agg._sum.amountCents ?? 0)} ${this.periodLabel(q, r.from)}.`;
      }

      case "SPEND_BY_CATEGORY": {
        const r = await this.range(householdId, q);
        if (!resolved.categoryId) {
          return "Não encontrei essa categoria. Tente pelo nome exato (ex.: “mercado”, “transporte”).";
        }
        const cat = await this.prisma.category.findUnique({ where: { id: resolved.categoryId } });
        const agg = await this.prisma.transaction.aggregate({
          where: {
            householdId,
            type: "EXPENSE",
            status: { not: "CANCELED" },
            transferGroupId: null,
            categoryId: resolved.categoryId,
            date: { gte: dateOnly(r.from), lte: dateOnly(r.to) },
          },
          _sum: { amountCents: true },
        });
        return `${cat?.icon ?? "🏷️"} Em *${cat?.name ?? "categoria"}* vocês gastaram ${formatBRL(
          agg._sum.amountCents ?? 0,
        )} ${this.periodLabel(q, r.from)}.`;
      }

      case "SPEND_BY_MEMBER": {
        const r = await this.range(householdId, q);
        if (!resolved.memberId) return "Não identifiquei a pessoa. Tente pelo nome (ex.: “quanto a Julia gastou?”).";
        const member = await this.prisma.householdMember.findUnique({
          where: { id: resolved.memberId },
        });
        const agg = await this.prisma.transaction.aggregate({
          where: {
            householdId,
            type: "EXPENSE",
            status: { not: "CANCELED" },
            transferGroupId: null,
            memberId: resolved.memberId,
            date: { gte: dateOnly(r.from), lte: dateOnly(r.to) },
          },
          _sum: { amountCents: true },
        });
        return `👤 *${member?.displayName ?? "Pessoa"}* gastou ${formatBRL(
          agg._sum.amountCents ?? 0,
        )} ${this.periodLabel(q, r.from)}.`;
      }

      case "TOP_EXPENSES": {
        const r = await this.range(householdId, q);
        const limit = q.params.limit ?? 5;
        const rows = await this.prisma.transaction.findMany({
          where: {
            householdId,
            type: "EXPENSE",
            status: { not: "CANCELED" },
            transferGroupId: null,
            date: { gte: dateOnly(r.from), lte: dateOnly(r.to) },
          },
          orderBy: { amountCents: "desc" },
          take: limit,
          include: { category: { select: { icon: true, name: true } } },
        });
        if (rows.length === 0) return `Nenhuma despesa ${this.periodLabel(q, r.from)}.`;
        const lines = rows.map(
          (t, i) =>
            `${i + 1}. ${t.category?.icon ?? "•"} ${t.description} — ${formatBRL(t.amountCents)}`,
        );
        return [`🔎 *Maiores despesas ${this.periodLabel(q, r.from)}:*`, "", ...lines].join("\n");
      }

      case "BILLS_DUE": {
        const tz = await this.tz(householdId);
        const invoices = await this.prisma.creditCardInvoice.findMany({
          where: { creditCard: { householdId }, status: { not: "PAID" } },
          orderBy: { dueDate: "asc" },
          include: { creditCard: { select: { name: true, icon: true } } },
        });
        if (invoices.length === 0) return "✅ Nenhuma fatura em aberto.";
        const total = invoices.reduce((a, i) => a + i.totalCents, 0);
        const lines = invoices
          .slice(0, 6)
          .map(
            (i) =>
              `${i.creditCard.icon} ${i.creditCard.name}: ${formatBRL(i.totalCents)} (vence ${formatDateBR(
                toIsoDate(i.dueDate),
                tz,
              )})`,
          );
        return [`💳 *Contas a pagar:* ${formatBRL(total)}`, "", ...lines].join("\n");
      }

      case "CARD_INVOICE": {
        if (!resolved.creditCardId) {
          const all = await this.cards.list(householdId);
          if (all.length === 0) return "Nenhum cartão cadastrado.";
          return `Qual cartão? ${all.map((c) => c.name).join(", ")}`;
        }
        const card = await this.prisma.creditCard.findUnique({
          where: { id: resolved.creditCardId },
        });
        const invoice = await this.prisma.creditCardInvoice.findFirst({
          where: { creditCardId: resolved.creditCardId, status: { in: ["OPEN", "CLOSED", "OVERDUE"] } },
          orderBy: { referenceMonth: "asc" },
        });
        if (!invoice) return `A fatura do ${card?.name ?? "cartão"} está zerada.`;
        const tz = await this.tz(householdId);
        return `💳 *${card?.name}* — fatura de ${monthLabelBR(toIsoDate(invoice.referenceMonth))}: ${formatBRL(
          invoice.totalCents,
        )} (vence ${formatDateBR(toIsoDate(invoice.dueDate), tz)}).`;
      }

      case "FUTURE_COMMITMENT": {
        const months = q.params.months ?? 6;
        const data = await this.installments.futureCommitment(householdId, months);
        const total = data.reduce((a, m) => a + m.cents, 0);
        if (total === 0) return "🎉 Nenhuma parcela comprometida nos próximos meses.";
        const lines = data
          .filter((m) => m.cents > 0)
          .slice(0, 6)
          .map((m) => `${monthLabelBR(m.month)}: ${formatBRL(m.cents)}`);
        return [`📅 *Comprometido nos próximos ${months} meses:* ${formatBRL(total)}`, "", ...lines].join(
          "\n",
        );
      }

      case "REMAINING_BUDGET": {
        // Orçamentos por categoria chegam na ETAPA 6. Por ora: resultado do mês.
        const r = await this.range(householdId, q);
        const report = await this.reports.dashboard(householdId, { from: r.from, to: r.to });
        const left = report.resultCents;
        return [
          `Neste mês entraram ${formatBRL(report.incomeCents)} e saíram ${formatBRL(report.expenseCents)}.`,
          left >= 0
            ? `Sobra até agora: *${formatBRL(left)}*.`
            : `Vocês estão *${formatBRL(-left)}* no vermelho no mês.`,
          "_(orçamentos por categoria chegam na próxima etapa)_",
        ].join("\n");
      }

      default:
        return "Ainda não sei responder isso.";
    }
  }
}
