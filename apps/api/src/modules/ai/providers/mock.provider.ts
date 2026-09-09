import { Injectable } from "@nestjs/common";
import { toCents } from "@rt-finance/shared";
import { AIService, type InterpretContext, type InterpretOutput } from "../ai.types";
import type { AiResult } from "@rt-finance/shared";

/**
 * Provider de IA por regras (sem rede, sem custo). Usado quando AI_PROVIDER=mock ou quando
 * falta NVIDIA_API_KEY. Cobre os casos principais para desenvolvimento e testes.
 */
@Injectable()
export class MockAiProvider extends AIService {
  private amount(text: string): number | null {
    const m = text.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{1,2})?)/i);
    if (!m) return null;
    try {
      return toCents(m[1]!);
    } catch {
      return null;
    }
  }

  async interpret(text: string, ctx: InterpretContext): Promise<InterpretOutput> {
    const t = text.trim().toLowerCase();
    const meta = { provider: "mock", model: "rules", latencyMs: 0 };
    const wrap = (result: AiResult): InterpretOutput => ({ result, meta });

    if (ctx.pendingSummary) {
      if (/^(1|sim|s|isso|confirmar|ok|pode)$/.test(t)) {
        return wrap({ kind: "confirmation_reply", choice: "YES", editText: null });
      }
      if (/^(2|n[aã]o|nao|cancela|cancelar)$/.test(t)) {
        return wrap({ kind: "confirmation_reply", choice: "NO", editText: null });
      }
      if (/^3|editar|corrig/.test(t)) {
        return wrap({ kind: "confirmation_reply", choice: "EDIT", editText: text });
      }
    }

    if (/(ajuda|help|menu|o que voc[eê] faz)/.test(t)) return wrap({ kind: "help" });

    const amountCents = this.amount(t);
    const installMatch = t.match(/(\d{1,2})\s*(?:x|vezes|parcelas)/);
    const cardHint =
      ctx.cards.find((c) => t.includes(c.toLowerCase())) ??
      (/(nubank|inter|itau|itaú|c6|bradesco|santander|will|neon)/.exec(t)?.[1] ?? null);

    if (amountCents && installMatch && (cardHint || /cart[aã]o/.test(t))) {
      return wrap({
        kind: "create_installment_purchase",
        totalCents: amountCents,
        installmentCount: Math.max(2, Number(installMatch[1])),
        description:
          text.replace(/.*?(gastei|paguei|comprei|foi|de)\s*/i, "").slice(0, 60) || "Compra parcelada",
        cardHint: cardHint ?? "cartão",
        categoryHint: null,
        purchaseDate: ctx.todayIso,
        firstDueDate: null,
        memberHint: null,
        confidence: 0.8,
        ambiguous: !cardHint,
        clarification: cardHint ? null : "Em qual cartão foi essa compra?",
      });
    }

    if (/(recebi|entrou|sal[aá]rio|caiu|pix recebido|rendimento)/.test(t) && amountCents) {
      return wrap({
        kind: "create_income",
        amountCents,
        description: /sal[aá]rio/.test(t) ? "Salário" : "Receita",
        categoryHint: /sal[aá]rio/.test(t) ? "Salário" : null,
        date: ctx.todayIso,
        paymentHint: null,
        memberHint: null,
        confidence: 0.82,
        ambiguous: false,
        clarification: null,
      });
    }

    if (/(gastei|paguei|comprei|gastamos|foi|torrei|custou)/.test(t) && amountCents) {
      const cat =
        ctx.categories.find((c) => t.includes(c.name.toLowerCase()))?.name ??
        (/mercado|supermercado/.test(t)
          ? "Mercado"
          : /gasolina|uber|99|combust/.test(t)
            ? "Transporte"
            : /ifood|restaurante|lanche|almo[cç]o|jantar/.test(t)
              ? "Alimentação"
              : null);
      return wrap({
        kind: "create_expense",
        amountCents,
        description: text.replace(/.*?(gastei|paguei|comprei|foi)\s*/i, "").slice(0, 60) || "Despesa",
        categoryHint: cat,
        date: ctx.todayIso,
        paymentHint: /d[eé]bito|dinheiro|pix/.test(t) ? t.match(/d[eé]bito|dinheiro|pix/)![0] : cardHint,
        memberHint: null,
        confidence: 0.78,
        ambiguous: false,
        clarification: null,
      });
    }

    if (/(quanto|quais|resumo|me mostra|gr[aá]fico|balan[cç]o|saldo|fatura|contas a pagar|comprometid)/.test(t)) {
      const wantsChart = /gr[aá]fico|imagem|mostra/.test(t);
      let template = "SPEND_BY_PERIOD";
      if (/resumo/.test(t)) template = "MONTHLY_SUMMARY";
      else if (/maiores|top/.test(t)) template = "TOP_EXPENSES";
      else if (/fatura/.test(t)) template = "CARD_INVOICE";
      else if (/saldo|balan[cç]o/.test(t)) template = "ACCOUNT_BALANCE";
      else if (/contas? (a|para) pagar|vencer/.test(t)) template = "BILLS_DUE";
      else if (/comprometid|pr[oó]ximos meses|parcelas futuras/.test(t)) template = "FUTURE_COMMITMENT";
      else if (/ainda (temos|tenho)|sobra|dispon[ií]vel|or[cç]amento/.test(t)) template = "REMAINING_BUDGET";
      else if (ctx.members.some((m) => t.includes(m.toLowerCase()))) template = "SPEND_BY_MEMBER";
      else if (/com\s+\w+/.test(t) || ctx.categories.some((c) => t.includes(c.name.toLowerCase())))
        template = "SPEND_BY_CATEGORY";

      const memberHint = ctx.members.find((m) => t.includes(m.toLowerCase())) ?? null;
      const categoryHint = ctx.categories.find((c) => t.includes(c.name.toLowerCase()))?.name ?? null;
      const accountHint =
        template === "ACCOUNT_BALANCE"
          ? ctx.accounts.find((a) => t.includes(a.toLowerCase())) ?? null
          : null;

      return wrap({
        kind: "query",
        template: template as never,
        params: {
          period: /m[eê]s passado/.test(t) ? "LAST_MONTH" : /ano/.test(t) ? "THIS_YEAR" : "THIS_MONTH",
          from: null,
          to: null,
          categoryHint,
          memberHint,
          cardHint,
          accountHint,
          months: /comprometid|pr[oó]ximos/.test(t) ? 12 : null,
          limit: /maiores|top/.test(t) ? 5 : null,
        },
        wantsChart,
        confidence: 0.7,
      });
    }

    return wrap({ kind: "unknown", reason: "não reconhecido pelas regras do mock" });
  }
}
