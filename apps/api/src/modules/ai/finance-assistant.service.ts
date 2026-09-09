import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AiChannel } from "@prisma/client";
import {
  invoiceCompetence,
  monthLabelBR,
  todayIso,
  type AiResult,
  type CreateTransactionBody,
  type CreateInstallmentPlanBody,
} from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";
import { toIsoDate } from "../../common/date-only";
import { TransactionsService } from "../transactions/transactions.service";
import { InstallmentsService } from "../installments/installments.service";
import { ReportsService } from "../reports/reports.service";
import { help as helpText } from "../whatsapp/formatters";
import { AIService, type InterpretContext, type AiMeta } from "./ai.types";
import { fastPath } from "./fast-path";
import { AiConversationService, type PendingAction } from "./ai-conversation.service";
import { HintResolver } from "../hints/hint-resolver.service";
import { QueryExecutor } from "./query-executor.service";
import { ChartRendererService } from "../charts/chart-renderer.service";
import * as rf from "./reply-format";

export interface AssistantInput {
  householdId: string;
  memberId: string;
  memberName: string;
  channel: AiChannel;
  text: string;
  messageId?: string | null;
}

export interface AssistantReply {
  reply: string;
  image?: Buffer;
}

const R = (reply: string): AssistantReply => ({ reply });

/** Cache curto (60s) da parte estável do contexto do household — evita 5 queries por mensagem. */
type StaticCtx = Pick<
  InterpretContext,
  "timezone" | "members" | "categories" | "cards" | "accounts"
>;
// stop-gap: TTL curto + limpeza por tamanho. Bust por mutação (categoria/conta/cartão) fica p/ a fase 2.
const CTX_TTL_MS = 20_000;
const CTX_CACHE_MAX = 200;
const ctxCache = new Map<string, { at: number; value: StaticCtx }>();

@Injectable()
export class FinanceAssistant {
  private readonly logger = new Logger(FinanceAssistant.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly conversations: AiConversationService,
    private readonly hints: HintResolver,
    private readonly queries: QueryExecutor,
    private readonly transactions: TransactionsService,
    private readonly installments: InstallmentsService,
    private readonly reports: ReportsService,
    private readonly charts: ChartRendererService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async handle(input: AssistantInput): Promise<AssistantReply> {
    const conv = await this.conversations.load(input.householdId, input.memberId, input.channel);
    const pending = this.conversations.getPending(conv);
    const ctx = await this.buildContext(input.householdId, pending?.summary ?? null);

    const fp = fastPath(input.text, {
      todayIso: ctx.todayIso,
      members: ctx.members,
      hasPending: !!pending,
    });
    const { result, meta }: { result: AiResult; meta: AiMeta } = fp
      ? { result: fp, meta: { provider: "fast-path", model: "rules", latencyMs: 0 } }
      : await this.ai.interpret(input.text, ctx);
    await this.conversations.recordInteraction({
      conversationId: conv.id,
      messageId: input.messageId,
      provider: meta.provider,
      model: meta.model,
      promptTokens: meta.promptTokens,
      completionTokens: meta.completionTokens,
      latencyMs: meta.latencyMs,
      intent: result.kind,
      confidence: "confidence" in result ? (result.confidence as number) : undefined,
      raw: meta.raw,
    });

    // ---- resposta a uma confirmação pendente ----
    if (pending) {
      if (result.kind === "confirmation_reply") {
        if (result.choice === "YES") return R(await this.commitPending(conv.id, input, pending));
        if (result.choice === "NO") {
          await this.conversations.clear(conv.id, "canceled");
          return R("Ok, cancelei. 👍");
        }
        // EDIT: reinterpreta o texto de edição como nova intenção
        await this.conversations.clear(conv.id);
        return this.handle({ ...input, text: result.editText ?? input.text });
      }
      if (result.kind === "unknown" || result.kind === "help") {
        return R("Você tem uma confirmação pendente. Responda *1* (sim), *2* (não) ou *3* (editar).");
      }
      await this.conversations.clear(conv.id);
    }

    let text: string;
    try {
      text = await this.route(conv.id, input, result);
    } catch (err) {
      this.logger.error(
        `route falhou (kind=${result.kind}): ${(err as Error).stack ?? String(err)}`,
      );
      throw err;
    }

    let image: Buffer | undefined;
    if (result.kind === "query" && result.wantsChart) {
      image = await this.buildChart(input.householdId, result).catch((e) => {
        this.logger.warn(`geração de gráfico falhou: ${(e as Error).message}`);
        return undefined;
      });
    }
    return { reply: text, image };
  }

  private async buildChart(
    householdId: string,
    r: Extract<AiResult, { kind: "query" }>,
  ): Promise<Buffer | undefined> {
    if (r.template === "FUTURE_COMMITMENT") {
      const data = await this.installments.futureCommitment(householdId, r.params.months ?? 6);
      const pts = data
        .filter((m) => m.cents > 0)
        .map((m) => ({ label: monthLabelBR(m.month).slice(0, 3), value: m.cents }));
      return pts.length ? this.charts.bars("Comprometimento futuro", pts) : undefined;
    }
    // demais: donut de gastos por categoria do período
    const dash = await this.reports.dashboard(householdId, {
      from: r.params.from ?? undefined,
      to: r.params.to ?? undefined,
    });
    const slices = dash.byCategory
      .filter((c) => c.cents > 0)
      .map((c) => ({ label: `${c.icon} ${c.name}`, value: c.cents, color: c.color }));
    return slices.length ? this.charts.donut("Gastos por categoria", slices) : undefined;
  }

  private async route(convId: string, input: AssistantInput, result: AiResult): Promise<string> {
    switch (result.kind) {
      case "help":
        return helpText(input.memberName);

      case "unknown":
        return rf.dontUnderstand();

      case "confirmation_reply":
        return "Não há nada pendente pra confirmar. Pode mandar o lançamento ou a pergunta.";

      case "create_expense":
      case "create_income":
        return this.handleCreateTransaction(convId, input, result);

      case "create_installment_purchase":
        return this.handleInstallment(convId, input, result);

      case "query":
        return this.handleQuery(input.householdId, input.memberId, result);
    }
  }

  // ---------------- create expense / income ----------------
  private async handleCreateTransaction(
    convId: string,
    input: AssistantInput,
    r: Extract<AiResult, { kind: "create_expense" | "create_income" }>,
  ): Promise<string> {
    const type = r.kind === "create_expense" ? "EXPENSE" : "INCOME";
    const kindKey = type === "EXPENSE" ? "EXPENSE" : "INCOME";

    if (r.ambiguous && r.clarification) {
      return `🤔 ${r.clarification}`;
    }

    const { category } = await this.hints.resolveCategory(input.householdId, r.categoryHint, kindKey);
    const memberId = await this.hints.resolveMember(input.householdId, r.memberHint, input.memberId);
    const pay = await this.hints.resolvePayment(input.householdId, r.paymentHint);

    if (!pay.accountId && !pay.creditCardId) {
      return "Você ainda não tem contas nem cartões cadastrados. Cadastre um no painel primeiro. 🙂";
    }

    const body: CreateTransactionBody = {
      type,
      amountCents: r.amountCents,
      description: r.description,
      date: r.date,
      categoryId: category?.id ?? null,
      memberId,
      accountId: pay.accountId,
      creditCardId: pay.creditCardId,
      status: "CONFIRMED",
      notes: null,
    };

    const member = await this.prisma.householdMember.findUnique({ where: { id: memberId } });
    const direct =
      r.confidence >= 0.7 &&
      !r.ambiguous &&
      r.amountCents < this.env.AI_CONFIRM_THRESHOLD_CENTS;

    const categoryLabel = category ? `${category.icon} ${category.name}` : "Sem categoria";

    if (direct) {
      await this.transactions.create(input.householdId, input.memberId, body);
      await this.conversations.clear(convId, r.kind);
      return rf.expenseRegistered({
        type,
        amountCents: r.amountCents,
        categoryLabel,
        dateIso: r.date,
        payLabel: pay.label,
        memberLabel: member?.displayName ?? input.memberName,
      });
    }

    const pending: PendingAction = {
      kind: type === "EXPENSE" ? "expense" : "income",
      summary: rf.confirmExpense({
        type,
        amountCents: r.amountCents,
        description: r.description,
        categoryLabel,
        payLabel: pay.label,
        dateIso: r.date,
      }),
      payload: body as unknown as Record<string, unknown>,
      createdAtIso: new Date().toISOString(),
    };
    await this.conversations.setPending(convId, pending, r.kind);
    return pending.summary;
  }

  // ---------------- create installment ----------------
  private async handleInstallment(
    convId: string,
    input: AssistantInput,
    r: Extract<AiResult, { kind: "create_installment_purchase" }>,
  ): Promise<string> {
    if (r.ambiguous && r.clarification) return `🤔 ${r.clarification}`;

    const card = await this.hints.resolveCard(input.householdId, r.cardHint);
    if (!card) {
      const cards = await this.prisma.creditCard.findMany({
        where: { householdId: input.householdId, status: "ACTIVE" },
        select: { name: true },
      });
      return cards.length
        ? `Em qual cartão foi essa compra? (${cards.map((c) => c.name).join(", ")})`
        : "Você ainda não cadastrou nenhum cartão. Cadastre um no painel primeiro.";
    }

    const { category } = await this.hints.resolveCategory(input.householdId, r.categoryHint, "EXPENSE");
    const memberId = await this.hints.resolveMember(input.householdId, r.memberHint, input.memberId);

    const comp = invoiceCompetence({
      date: r.firstDueDate ?? r.purchaseDate,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      tz: this.env.APP_TIMEZONE,
    });

    const body: CreateInstallmentPlanBody = {
      creditCardId: card.id,
      categoryId: category?.id ?? null,
      memberId,
      description: r.description,
      totalCents: r.totalCents,
      installmentCount: r.installmentCount,
      purchaseDate: r.purchaseDate,
      firstDueDate: r.firstDueDate ?? null,
    };

    const pending: PendingAction = {
      kind: "installment_purchase",
      summary: rf.confirmInstallment({
        description: r.description,
        totalCents: r.totalCents,
        count: r.installmentCount,
        cardLabel: card.name,
        categoryLabel: category ? `${category.icon} ${category.name}` : "Sem categoria",
        firstDueLabel: `fatura de ${monthLabelBR(comp.referenceMonth)} (vence ${comp.dueDate
          .split("-")
          .reverse()
          .join("/")})`,
      }),
      payload: body as unknown as Record<string, unknown>,
      createdAtIso: new Date().toISOString(),
    };
    await this.conversations.setPending(convId, pending, r.kind);
    return pending.summary;
  }

  // ---------------- query ----------------
  private async handleQuery(
    householdId: string,
    memberId: string,
    r: Extract<AiResult, { kind: "query" }>,
  ): Promise<string> {
    const [cat, mem, card, account] = await Promise.all([
      r.params.categoryHint
        ? this.hints.resolveCategory(householdId, r.params.categoryHint, "EXPENSE")
        : Promise.resolve({ category: null }),
      r.params.memberHint
        ? this.hints.resolveMember(householdId, r.params.memberHint, memberId)
        : Promise.resolve(null),
      this.hints.resolveCard(householdId, r.params.cardHint),
      this.hints.resolveAccount(householdId, r.params.accountHint),
    ]);

    return this.queries.run(householdId, r, {
      categoryId: cat.category?.id ?? null,
      memberId: mem,
      creditCardId: card?.id ?? null,
      accountId: account?.id ?? null,
    });
  }

  private brl(cents: number): string {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // ---------------- commit pending ----------------
  private async commitPending(
    convId: string,
    input: AssistantInput,
    pending: PendingAction,
  ): Promise<string> {
    try {
      if (pending.kind === "installment_purchase") {
        const body = pending.payload as unknown as CreateInstallmentPlanBody;
        await this.installments.create(input.householdId, input.memberId, body);
        await this.conversations.clear(convId, "committed");
        return rf.installmentRegistered({
          description: body.description,
          totalCents: body.totalCents,
          count: body.installmentCount,
          cardLabel: (
            await this.prisma.creditCard.findUnique({ where: { id: body.creditCardId } })
          )?.name ?? "cartão",
        });
      }

      const body = pending.payload as unknown as CreateTransactionBody;
      const tx = await this.transactions.create(input.householdId, input.memberId, body);
      await this.conversations.clear(convId, "committed");

      const [category, member] = await Promise.all([
        body.categoryId
          ? this.prisma.category.findUnique({ where: { id: body.categoryId } })
          : Promise.resolve(null),
        this.prisma.householdMember.findUnique({ where: { id: body.memberId ?? input.memberId } }),
      ]);
      const payLabel = body.creditCardId
        ? (await this.prisma.creditCard.findUnique({ where: { id: body.creditCardId } }))?.name ?? "cartão"
        : (await this.prisma.account.findUnique({ where: { id: body.accountId ?? "" } }))?.name ?? "conta";

      return rf.expenseRegistered({
        type: body.type,
        amountCents: tx.amountCents,
        categoryLabel: category ? `${category.icon} ${category.name}` : "Sem categoria",
        dateIso: toIsoDate(tx.date),
        payLabel,
        memberLabel: member?.displayName ?? input.memberName,
      });
    } catch (err) {
      this.logger.error({ err }, "falha ao efetivar ação pendente");
      await this.conversations.clear(convId, "error");
      return "❌ Não consegui salvar o lançamento. Tente novamente ou use o painel.";
    }
  }

  // ---------------- contexto ----------------
  private async loadStaticCtx(householdId: string): Promise<StaticCtx> {
    const hit = ctxCache.get(householdId);
    if (hit && Date.now() - hit.at < CTX_TTL_MS) return hit.value;

    const [categories, cards, members, accounts, household] = await Promise.all([
      this.prisma.category.findMany({
        where: { householdId, archivedAt: null },
        select: { name: true, kind: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.creditCard.findMany({
        where: { householdId, status: "ACTIVE" },
        select: { name: true },
      }),
      this.prisma.householdMember.findMany({
        where: { householdId },
        select: { displayName: true },
      }),
      this.prisma.account.findMany({
        where: { householdId, archivedAt: null },
        select: { name: true },
      }),
      this.prisma.household.findUnique({ where: { id: householdId }, select: { timezone: true } }),
    ]);

    const value: StaticCtx = {
      timezone: household?.timezone ?? this.env.APP_TIMEZONE,
      members: members.map((m) => m.displayName),
      categories: categories.map((c) => ({ name: c.name, kind: c.kind })),
      cards: cards.map((c) => c.name),
      accounts: accounts.map((a) => a.name),
    };
    if (ctxCache.size > CTX_CACHE_MAX) ctxCache.clear();
    ctxCache.set(householdId, { at: Date.now(), value });
    return value;
  }

  private async buildContext(
    householdId: string,
    pendingSummary: string | null,
  ): Promise<InterpretContext> {
    const [staticCtx, history] = await Promise.all([
      this.loadStaticCtx(householdId),
      this.prisma.whatsappMessage.findMany({
        where: { householdId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { direction: true, text: true },
      }),
    ]);

    const tz = staticCtx.timezone;
    return {
      todayIso: todayIso(tz),
      timezone: tz,
      members: staticCtx.members,
      categories: staticCtx.categories,
      cards: staticCtx.cards,
      accounts: staticCtx.accounts,
      history: history
        .reverse()
        .filter((h) => h.text)
        .map((h) => ({
          role: h.direction === "INBOUND" ? ("user" as const) : ("assistant" as const),
          text: h.text!,
        })),
      pendingSummary,
    };
  }
}
