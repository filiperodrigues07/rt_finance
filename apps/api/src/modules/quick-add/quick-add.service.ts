import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  todayIso,
  invoiceCompetence,
  monthLabelBR,
  splitInstallments,
  type AiResult,
  type CreateTransactionBody,
  type QuickAddResult,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { DomainError } from "../../common/errors/domain-error";
import { fastPath } from "../ai/fast-path";
import { AIService, type InterpretContext } from "../ai/ai.types";
import { HintResolver } from "../hints/hint-resolver.service";
import { TransactionsService } from "../transactions/transactions.service";

/**
 * Lançamento rápido do painel web. Tenta resolver por regras (instantâneo) e,
 * quando não dá (cartão citado, parcelamento, frase atípica), cai no LLM — o
 * mesmo provedor do bot. Nunca grava parcelamento direto: devolve `preview`
 * para o usuário confirmar.
 */
@Injectable()
export class QuickAddService {
  private readonly logger = new Logger(QuickAddService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly hints: HintResolver,
    private readonly transactions: TransactionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async run(householdId: string, memberId: string, text: string): Promise<QuickAddResult> {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    const tz = household?.timezone ?? this.env.APP_TIMEZONE;
    const today = todayIso(tz);

    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      select: { displayName: true },
    });

    // 1. regras — cobre "gastei 50 no mercado", "recebi 2000 de salário" etc.
    let result: AiResult | null = fastPath(text, {
      todayIso: today,
      members: members.map((m) => m.displayName),
      hasPending: false,
    });

    // 2. LLM — só quando as regras não têm certeza
    if (!result) {
      try {
        const ctx = await this.buildContext(householdId, tz, today);
        ({ result } = await this.ai.interpret(text, ctx));
      } catch (err) {
        this.logger.warn(`interpret falhou: ${(err as Error).message}`);
        return this.needsForm("Não consegui interpretar agora — confira no formulário.", text);
      }
    }

    try {
      switch (result.kind) {
        case "create_expense":
        case "create_income":
          return await this.createSimple(householdId, memberId, result, today);
        case "create_installment_purchase":
          return await this.previewInstallment(householdId, memberId, result, tz);
        default:
          return this.needsForm("Não entendi o lançamento — confira os campos.", text);
      }
    } catch (err) {
      if (err instanceof DomainError) return this.needsForm(err.message, text);
      throw err;
    }
  }

  // ---------------- despesa / receita simples ----------------
  private async createSimple(
    householdId: string,
    memberId: string,
    r: Extract<AiResult, { kind: "create_expense" | "create_income" }>,
    today: string,
  ): Promise<QuickAddResult> {
    if (r.ambiguous && r.clarification) {
      return this.needsForm(r.clarification, r.description, r.amountCents);
    }

    const kind = r.kind === "create_expense" ? "EXPENSE" : "INCOME";
    const [{ category }, resolvedMember, pay] = await Promise.all([
      this.hints.resolveCategory(householdId, r.categoryHint, kind),
      this.hints.resolveMember(householdId, r.memberHint, memberId),
      this.hints.resolvePayment(householdId, r.paymentHint),
    ]);
    if (!pay.accountId && !pay.creditCardId) {
      return this.needsForm(
        "Cadastre uma conta ou cartão antes de usar o lançamento rápido.",
        r.description,
        r.amountCents,
      );
    }

    const body: CreateTransactionBody = {
      type: kind,
      amountCents: r.amountCents,
      description: r.description,
      date: r.date ?? today,
      categoryId: category?.id ?? null,
      memberId: resolvedMember,
      accountId: pay.accountId,
      creditCardId: pay.creditCardId,
      status: "CONFIRMED",
      notes: null,
    };
    const transaction = await this.transactions.create(householdId, memberId, body);
    return { status: "created", transaction };
  }

  // ---------------- compra parcelada (preview) ----------------
  private async previewInstallment(
    householdId: string,
    memberId: string,
    r: Extract<AiResult, { kind: "create_installment_purchase" }>,
    tz: string,
  ): Promise<QuickAddResult> {
    if (r.ambiguous && r.clarification) {
      return this.needsForm(r.clarification, r.description, r.totalCents, r.installmentCount);
    }

    const card = await this.hints.resolveCard(householdId, r.cardHint);
    if (!card) {
      return this.needsForm(
        "Não identifiquei o cartão — escolha no formulário de parcelamento.",
        r.description,
        r.totalCents,
        r.installmentCount,
      );
    }

    const [{ category }, resolvedMember] = await Promise.all([
      this.hints.resolveCategory(householdId, r.categoryHint, "EXPENSE"),
      this.hints.resolveMember(householdId, r.memberHint, memberId),
    ]);

    const comp = invoiceCompetence({
      date: r.firstDueDate ?? r.purchaseDate,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      tz,
    });
    const parts = splitInstallments(r.totalCents, r.installmentCount);
    const dueBR = comp.dueDate.split("-").reverse().join("/");

    return {
      status: "preview",
      plan: {
        creditCardId: card.id,
        cardLabel: card.name,
        categoryId: category?.id ?? null,
        categoryLabel: category ? `${category.icon} ${category.name}` : "Sem categoria",
        memberId: resolvedMember,
        description: r.description,
        totalCents: r.totalCents,
        installmentCount: r.installmentCount,
        installmentCents: parts[0]!,
        purchaseDate: r.purchaseDate,
        firstDueDate: r.firstDueDate ?? null,
        firstInvoiceLabel: `fatura de ${monthLabelBR(comp.referenceMonth)} · vence ${dueBR}`,
      },
    };
  }

  private needsForm(
    reason: string,
    description: string,
    amountCents: number | null = null,
    installmentCount: number | null = null,
  ): QuickAddResult {
    return {
      status: "needs_form",
      reason,
      draft: {
        type: "EXPENSE",
        amountCents,
        description: description.trim().slice(0, 280),
        installmentCount,
      },
    };
  }

  private async buildContext(
    householdId: string,
    tz: string,
    today: string,
  ): Promise<InterpretContext> {
    const [members, categories, cards, accounts] = await Promise.all([
      this.prisma.householdMember.findMany({
        where: { householdId },
        select: { displayName: true },
      }),
      this.prisma.category.findMany({
        where: { householdId, archivedAt: null },
        select: { name: true, kind: true },
      }),
      this.prisma.creditCard.findMany({
        where: { householdId, status: "ACTIVE" },
        select: { name: true },
      }),
      this.prisma.account.findMany({
        where: { householdId, archivedAt: null },
        select: { name: true },
      }),
    ]);

    return {
      todayIso: today,
      timezone: tz,
      members: members.map((m) => m.displayName),
      categories: categories.map((c) => ({ name: c.name, kind: c.kind })),
      cards: cards.map((c) => c.name),
      accounts: accounts.map((a) => a.name),
      history: [],
      pendingSummary: null,
    };
  }
}
