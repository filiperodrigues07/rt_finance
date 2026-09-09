import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { monthLabelBR, type ReportAnalysis } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { AIService } from "../ai/ai.types";
import { ReportsService } from "../reports/reports.service";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// "detailed thinking off": convenção do nemotron — desliga o raciocínio em voz alta
// (sem bloco <think>, resposta ~5x mais rápida e JSON direto).
const SYSTEM_PROMPT =
  "detailed thinking off\n" +
  [
    "Você é um consultor financeiro de um casal brasileiro.",
    "Escreva em português do Brasil, tom direto e acolhedor, sem jargão.",
    "Baseie-se SOMENTE nos dados fornecidos — nunca invente números nem suponha o que não está ali.",
    "Responda APENAS um objeto JSON no formato:",
    '{"resumo": string (2 a 4 frases), "recomendacoes": string[] (2 a 4 itens curtos e acionáveis)}.',
  ].join(" ");

const AiShape = z.object({
  resumo: z.string().trim().min(1),
  recomendacoes: z.array(z.string().trim().min(1)).min(1).max(6),
});

/** Modelos de raciocínio (nemotron) devolvem `<think>…</think>` + texto antes do JSON. */
function extractJson(text: string): unknown {
  let s = text;
  // fica com o que vem depois do último bloco de raciocínio fechado
  const lastThink = s.lastIndexOf("</think>");
  if (lastThink !== -1) s = s.slice(lastThink + "</think>".length);
  // se ficou um <think> aberto (resposta cortada), não há JSON utilizável
  s = s.replace(/<think>[\s\S]*/i, "").replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("sem objeto JSON na resposta");
  return JSON.parse(s.slice(start, end + 1));
}

/**
 * Análise do mês em linguagem natural. Cache de 24h por household (custo/latência
 * de IA); `force` fura. Cai numa versão por regras quando a IA não está disponível.
 */
@Injectable()
export class ReportsAiService {
  private readonly logger = new Logger(ReportsAiService.name);
  private readonly cache = new Map<string, { at: number; value: ReportAnalysis }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly reports: ReportsService,
  ) {}

  async analysis(householdId: string, force = false): Promise<ReportAnalysis> {
    const hit = this.cache.get(householdId);
    if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const [dash, pace, insights, goals] = await Promise.all([
      this.reports.dashboard(householdId, {}),
      this.reports.pace(householdId),
      this.reports.insights(householdId),
      this.prisma.financialGoal.findMany({
        where: { householdId, status: { not: "ARCHIVED" } },
        select: { name: true, targetCents: true, currentCents: true, deadline: true },
      }),
    ]);

    const facts = {
      mes: pace.monthLabel,
      diaDoMes: `${pace.daysElapsed}/${pace.daysInMonth}`,
      receitaAteAgora: brl(dash.incomeCents),
      gastoAteAgora: brl(dash.expenseCents),
      resultadoAteAgora: brl(dash.resultCents),
      mesAnterior: {
        receita: brl(dash.prev.incomeCents),
        gasto: brl(dash.prev.expenseCents),
      },
      projecao:
        pace.daysElapsed >= 5
          ? {
              gastoProjetado: brl(pace.projectedSpendCents),
              receitaProjetada: brl(pace.projectedIncomeCents),
              resultadoProjetado: brl(pace.projectedResultCents),
              contasFixasAVencer: brl(pace.knownBillsRemainingCents),
              gastoVariavelPorDia: brl(pace.discretionaryPerDayCents),
            }
          : "poucos dias no mês para projetar",
      topCategorias: dash.byCategory.slice(0, 5).map((c) => ({
        nome: c.name,
        gasto: brl(c.cents),
        percentualDoMes: `${c.percent}%`,
      })),
      faturasEmAberto: brl(dash.invoicesOpenCents),
      venceEm15Dias: brl(dash.upcomingDueCents),
      porPessoa: dash.byMember.map((m) => ({ nome: m.displayName, gasto: brl(m.cents) })),
      metas: goals.map((g) => ({
        nome: g.name,
        progresso: `${Math.round((g.currentCents / Math.max(1, g.targetCents)) * 100)}%`,
        prazo: g.deadline ? g.deadline.toISOString().slice(0, 10) : null,
      })),
      patrimonioAgora: brl(pace.netWorth.at(-1)?.cents ?? 0),
      patrimonio6MesesAtras: brl(pace.netWorth.at(-7)?.cents ?? pace.netWorth[0]?.cents ?? 0),
    };

    let value: ReportAnalysis;
    try {
      const { text } = await this.ai.analyze(SYSTEM_PROMPT, JSON.stringify(facts));
      const json = AiShape.parse(extractJson(text));
      value = {
        resumo: json.resumo,
        recomendacoes: json.recomendacoes.slice(0, 4),
        geradoEm: new Date().toISOString(),
        fonte: "ia",
      };
    } catch (err) {
      this.logger.warn(`análise por IA indisponível, usando regras: ${(err as Error).message}`);
      value = this.fromRules(dash, pace, insights);
    }

    this.cache.set(householdId, { at: Date.now(), value });
    return value;
  }

  private fromRules(
    dash: Awaited<ReturnType<ReportsService["dashboard"]>>,
    pace: Awaited<ReturnType<ReportsService["pace"]>>,
    insights: Awaited<ReturnType<ReportsService["insights"]>>,
  ): ReportAnalysis {
    const parts = [
      `Em ${monthLabelBR(pace.netWorth.at(-1)?.month ?? new Date())}, até o dia ${pace.daysElapsed}, ` +
        `vocês gastaram ${brl(dash.expenseCents)} e receberam ${brl(dash.incomeCents)}.`,
    ];
    if (pace.daysElapsed >= 5) {
      parts.push(
        `No ritmo atual o mês fecha em ${brl(pace.projectedResultCents)} ` +
          `(${brl(pace.knownBillsRemainingCents)} ainda são contas fixas a vencer).`,
      );
    }
    const recs = insights
      .map((i) => `${i.title}: ${i.detail}`)
      .slice(0, 4);
    return {
      resumo: parts.join(" "),
      recomendacoes: recs.length ? recs : ["Sem alertas relevantes no momento. Mantenha o ritmo."],
      geradoEm: new Date().toISOString(),
      fonte: "regras",
    };
  }
}
