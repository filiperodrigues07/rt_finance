import { toCents, guessCategory, type AiResult } from "@rt-finance/shared";

/**
 * Classificador por regras para os casos mais comuns — evita chamar o LLM (resposta
 * quase instantânea). Retorna null quando não tem certeza; aí o fluxo cai no LLM.
 */

function parseAmount(text: string): number | null {
  // primeiro número "de dinheiro" na frase: 20 · 20,50 · 1.500 · 1.500,90 · R$ 20
  const m = text.match(/r\$\s*([\d.]+,\d{2}|[\d.]+)|\b(\d[\d.]*,\d{2}|\d[\d.]*)\b/i);
  const tok = m?.[1] ?? m?.[2];
  if (!tok) return null;
  try {
    const c = toCents(tok);
    return c >= 1 && c <= 1_000_000_00 ? c : null;
  } catch {
    return null;
  }
}

const CARD_HINT = /\b(no|na)\s+(cart[aã]o\s+)?(nubank|inter|ita[uú]|c6|bradesco|santander|will|neon|next|original|pan|bmg|digio|xp)\b/i;
const INSTALLMENT = /\b\d{1,2}\s*(x|vezes|parcelas)\b/i;

export function fastPath(
  text: string,
  ctx: { todayIso: string; members: string[]; hasPending: boolean },
): AiResult | null {
  const raw = text.trim();
  const t = raw.toLowerCase();

  // resposta a confirmação pendente
  if (ctx.hasPending) {
    if (/^(1|sim|s|isso|confirma[r]?|ok|pode|manda)\b/.test(t)) {
      return { kind: "confirmation_reply", choice: "YES", editText: null };
    }
    if (/^(2|n[aã]o|nao|cancela[r]?|deixa)\b/.test(t)) {
      return { kind: "confirmation_reply", choice: "NO", editText: null };
    }
    if (/^(3|edita[r]?|corrig)/.test(t)) {
      return { kind: "confirmation_reply", choice: "EDIT", editText: raw };
    }
    return null; // qualquer outra coisa: deixa o LLM decidir
  }

  if (/^(ajuda|help|menu|oi|ol[aá]|bom dia|boa tarde|boa noite)\b/.test(t)) {
    return { kind: "help" };
  }

  // parcelamento: precisa de cartão/parcelas — melhor o LLM
  if (INSTALLMENT.test(t)) return null;

  const amount = parseAmount(t);

  // receita
  if (amount && /\b(recebi|ganhei|entrou|caiu|pix recebido|sal[aá]rio|rendimento|freela)\b/.test(t)) {
    const isSalary = /sal[aá]rio/.test(t);
    return {
      kind: "create_income",
      amountCents: amount,
      description: isSalary ? "Salário" : "Receita",
      categoryHint: isSalary ? "Salário" : null,
      date: ctx.todayIso,
      paymentHint: null,
      memberHint: null,
      confidence: 0.9,
      ambiguous: false,
      clarification: null,
    };
  }

  // despesa simples (sem cartão citado, sem parcelas)
  if (amount && /^(gastei|paguei|comprei|torrei|foi|custou|gastamos)\b/.test(t) && !CARD_HINT.test(t)) {
    const after = raw.replace(/^\s*\S+\s+/i, "").replace(/^(r\$\s*)?[\d.,\s]+(reais|conto|pila)?\s*/i, "").trim();
    const catHint = guessCategory(raw, "EXPENSE");
    return {
      kind: "create_expense",
      amountCents: amount,
      description: cap(after.replace(/^(no|na|em|de|com|pra|para|a[o]?)\s+/i, "").slice(0, 60)) || "Despesa",
      categoryHint: catHint,
      date: ctx.todayIso,
      paymentHint: /d[eé]bito|dinheiro|pix|esp[eé]cie/.test(t) ? t.match(/d[eé]bito|dinheiro|pix|esp[eé]cie/)![0] : null,
      memberHint: null,
      confidence: 0.82,
      ambiguous: false,
      clarification: null,
    };
  }

  // consultas frequentes
  if (/\bresumo\b/.test(t)) {
    return { kind: "query", template: "MONTHLY_SUMMARY", params: emptyParams(), wantsChart: /gr[aá]fico|imagem/.test(t), confidence: 0.9 };
  }
  if (/quanto (gast|gastamos|gastei)/.test(t) && !/com\s+\w/.test(t) && !ctx.members.some((m) => t.includes(m.toLowerCase()))) {
    return { kind: "query", template: "SPEND_BY_PERIOD", params: { ...emptyParams(), period: /m[eê]s passado/.test(t) ? "LAST_MONTH" : "THIS_MONTH" }, wantsChart: false, confidence: 0.85 };
  }
  const mentioned = ctx.members.find((m) => t.includes(m.toLowerCase()));
  if (mentioned && /quanto .*(gast|gastou)/.test(t)) {
    return { kind: "query", template: "SPEND_BY_MEMBER", params: { ...emptyParams(), memberHint: mentioned }, wantsChart: false, confidence: 0.85 };
  }

  return null;
}

function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function emptyParams() {
  return {
    period: "THIS_MONTH" as const,
    from: null,
    to: null,
    categoryHint: null,
    memberHint: null,
    cardHint: null,
    months: null,
    limit: null,
  };
}
