import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { toCents, guessCategory } from "@rt-finance/shared";
import { ENV, type Env } from "../../config/env.schema";

export interface ExtractedRow {
  postedDate: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // positivo
  type: "EXPENSE" | "INCOME";
  categoryHint: string | null;
}

export interface ExtractContext {
  /** conta bancária ou fatura de cartão — não importa se veio de PDF ou de foto (OCR). */
  source: "BANK" | "CARD";
  categories: string[];
  todayIso: string;
  timezone: string;
}

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int(),
  type: z.enum(["EXPENSE", "INCOME"]).optional(),
  categoryHint: z.string().trim().min(1).nullable().optional(),
});
const responseSchema = z.object({ rows: z.array(rowSchema) });

const CHUNK_CHARS = 11_000;

// espaços "especiais" (NBSP e afins) que aparecem em PDF/OCR — construído por
// codepoint pra não depender de caracteres literais no arquivo-fonte.
const WEIRD_SPACE_CODES = [0x00a0, 0x2007, 0x202f, 0x2009, 0x200a, 0x2002, 0x2003];
const WEIRD_SPACES = new RegExp(`[${WEIRD_SPACE_CODES.map((c) => String.fromCodePoint(c)).join("")}]`, "g");

/** Mascara dados sensíveis antes de enviar o texto ao provedor de IA. */
function maskPii(text: string): string {
  return text
    // cartão (13–19 dígitos, com ou sem separador)
    .replace(/\b(?:\d[ .-]?){13,19}\b/g, (m) => (/\d{13,}/.test(m.replace(/\D/g, "")) ? "**** cartão ****" : m))
    // CPF
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**")
    // CNPJ
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "**.***.***/****-**")
    // agência/conta longa isolada (7+ dígitos)
    .replace(/\bconta[:\s]+\d{5,}\b/gi, "conta: *****");
}

/** Tenta decodificar JSON, inclusive quando vem com texto ao redor. */
function tryParseJson(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    /* segue pra tentativa com regex */
  }
  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* dá errado mesmo */
    }
  }
  return null;
}

/**
 * Extrai lançamentos do texto de um extrato/fatura (PDF ou foto via OCR) usando a
 * NVIDIA NIM (mesmo endpoint OpenAI-compatível do bot). Sem chave/mock → cai no
 * parser regex. O texto TRAFEGA para o provedor de IA — decisão explícita do
 * usuário — mas passa por `maskPii` antes.
 */
@Injectable()
export class ImportAiService {
  private readonly logger = new Logger(ImportAiService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get model(): string {
    return this.useLlm ? this.env.NVIDIA_MODEL : "regex-fallback";
  }

  private get useLlm(): boolean {
    return this.env.AI_PROVIDER === "nvidia" && Boolean(this.env.NVIDIA_API_KEY);
  }

  async extract(text: string, ctx: ExtractContext): Promise<ExtractedRow[]> {
    const norm = text
      .replace(WEIRD_SPACES, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!norm) return [];
    if (!this.useLlm) return this.fallback(norm, ctx);

    const chunks = splitByLines(norm, CHUNK_CHARS);
    const all: ExtractedRow[] = [];
    for (const chunk of chunks) {
      try {
        all.push(...(await this.extractChunk(chunk, ctx)));
      } catch (err) {
        this.logger.warn(`chunk falhou (${(err as Error).message}); usando fallback no trecho`);
        all.push(...this.fallback(chunk, ctx));
      }
    }
    return dedupeRows(all);
  }

  private buildSystemPrompt(ctx: ExtractContext): string {
    return [
      "detailed thinking off",
      "Você extrai lançamentos de um extrato bancário ou fatura de cartão em português.",
      "O texto pode vir de OCR de foto/print — pode ter erro de leitura pontual (letra trocada, espaço a mais); use o contexto pra entender mesmo assim.",
      `Hoje é ${ctx.todayIso} (fuso ${ctx.timezone}).`,
      'Responda APENAS um JSON: {"rows":[{"date":"YYYY-MM-DD","description":str,"amountCents":int,"type":"EXPENSE"|"INCOME","categoryHint":str|null}]}.',
      "amountCents = inteiro em centavos, SEMPRE positivo. type=EXPENSE para gasto/débito/compra; INCOME para crédito/depósito/estorno/pagamento recebido.",
      "Datas sem ano: use o ano do documento; se o mês da linha for menor que o mês de uma linha anterior na mesma fatura, é virada de ano (dezembro→janeiro) — some 1 ao ano.",
      ctx.source === "CARD"
        ? "É uma fatura de cartão: quase tudo é EXPENSE; 'pagamento recebido'/'estorno'/'crédito' = INCOME. NÃO gere linha para: saldo/limite disponível, 'total da fatura', 'encargos'/'juros' já somados no total, 'saldo anterior', propaganda do banco."
        : "É um extrato de conta: NÃO gere linha para 'SALDO', 'saldo do dia', 'saldo anterior', 'saldo disponível'.",
      `Categorias disponíveis (use uma como categoryHint quando fizer sentido, senão null): ${ctx.categories.join(", ")}.`,
      "Não invente lançamentos que não estão no texto. Se não houver nenhum, responda {\"rows\":[]}.",
    ].join("\n");
  }

  private async chatOnce(system: string, user: string): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(this.env.AI_REQUEST_TIMEOUT_MS, 45_000));
    try {
      const res = await fetch(`${this.env.NVIDIA_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          authorization: `Bearer ${this.env.NVIDIA_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.env.NVIDIA_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0,
          max_tokens: 8000,
          response_format: { type: "json_object" },
        }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${body.slice(0, 160)}`);
      return (JSON.parse(body).choices?.[0]?.message?.content ?? "{}") as string;
    } finally {
      clearTimeout(timer);
    }
  }

  private async extractChunk(chunk: string, ctx: ExtractContext): Promise<ExtractedRow[]> {
    const system = this.buildSystemPrompt(ctx);
    const masked = maskPii(chunk);

    let content = await this.chatOnce(system, masked);
    let json = tryParseJson(content);
    let parsed = json !== null ? responseSchema.safeParse(json) : { success: false as const };

    if (!parsed.success) {
      // 1 retentativa de reparo — mesmo padrão usado na interpretação do WhatsApp
      this.logger.warn("JSON inválido na extração; tentando reparo");
      content = await this.chatOnce(
        `${system}\n\nA resposta anterior não veio em JSON válido. Responda SOMENTE o JSON, sem texto ao redor.`,
        masked,
      );
      json = tryParseJson(content);
      parsed = json !== null ? responseSchema.safeParse(json) : { success: false as const };
    }

    if (!parsed.success) return [];
    return parsed.data.rows
      .map((r) => {
        const amountCents = Math.abs(r.amountCents);
        if (!amountCents) return null;
        const type: "EXPENSE" | "INCOME" = r.type ?? (r.amountCents < 0 ? "EXPENSE" : "INCOME");
        return {
          postedDate: r.date,
          description: r.description,
          amountCents,
          type,
          categoryHint: r.categoryHint ?? guessCategory(r.description, type),
        } satisfies ExtractedRow;
      })
      .filter((r): r is ExtractedRow => r !== null);
  }

  /** Parser regex simples para dev/offline e para trechos que a IA não deu conta. */
  private fallback(text: string, ctx: ExtractContext): ExtractedRow[] {
    const out: ExtractedRow[] = [];
    const year = ctx.todayIso.slice(0, 4);
    for (const line of text.split(/\r?\n/)) {
      if (/saldo|limite dispon|total da fatura|fatura anterior/i.test(line)) continue;
      const dm = line.match(/\b(\d{2})[/.-](\d{2})(?:[/.-](\d{2,4}))?\b/);
      const vm = line.match(/(-?\s*R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/);
      if (!dm || !vm) continue;
      const yy = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : year;
      const postedDate = `${yy}-${dm[2]}-${dm[1]}`;
      const rawVal = vm[1]!.replace(/\s/g, "");
      const negative = /^-/.test(rawVal) || /\bD\b\s*$/.test(line);
      let cents: number;
      try {
        cents = Math.abs(toCents(rawVal.replace(/^-/, "")));
      } catch {
        continue;
      }
      if (!cents) continue;
      const description =
        line
          .replace(dm[0], "")
          .replace(vm[0], "")
          .replace(/\s{2,}/g, " ")
          .replace(/^[\s\-–|]+|[\s\-–|]+$/g, "")
          .slice(0, 240) || "Lançamento";
      const type: "EXPENSE" | "INCOME" =
        ctx.source === "CARD"
          ? /pagamento recebido|estorno|cr[eé]dito/i.test(line)
            ? "INCOME"
            : "EXPENSE"
          : negative
            ? "EXPENSE"
            : "INCOME";
      out.push({
        postedDate,
        description,
        amountCents: cents,
        type,
        categoryHint: guessCategory(description, type),
      });
    }
    return dedupeRows(out);
  }
}

function splitByLines(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let buf = "";
  for (const line of lines) {
    if (buf.length + line.length + 1 > maxChars && buf) {
      chunks.push(buf);
      buf = "";
    }
    buf += (buf ? "\n" : "") + line;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function dedupeRows(rows: ExtractedRow[]): ExtractedRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.postedDate}|${r.amountCents}|${r.type}|${r.description.toLowerCase().slice(0, 40)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
