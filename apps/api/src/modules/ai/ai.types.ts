import type { AiResult } from "@rt-finance/shared";

export interface InterpretContext {
  todayIso: string;
  timezone: string;
  members: string[]; // displayNames
  categories: { name: string; kind: string }[];
  cards: string[]; // nomes
  accounts: string[]; // nomes
  /** Últimas trocas da conversa (mais recentes por último). */
  history: { role: "user" | "assistant"; text: string }[];
  /** Resumo da ação pendente de confirmação, se houver. */
  pendingSummary?: string | null;
}

export interface AiMeta {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  raw?: unknown;
}

export interface InterpretOutput {
  result: AiResult;
  meta: AiMeta;
}

/** Contrato de qualquer provedor de IA. Token de DI. */
export abstract class AIService {
  abstract interpret(text: string, ctx: InterpretContext): Promise<InterpretOutput>;

  /**
   * Completude livre (não estruturada como intent). `system` guia o tom/formato,
   * `user` traz os dados. Deve lançar se o provedor não estiver disponível —
   * quem chama decide o fallback.
   */
  abstract analyze(system: string, user: string): Promise<{ text: string; meta: AiMeta }>;
}
