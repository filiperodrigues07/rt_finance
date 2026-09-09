import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type Env } from "../../../config/env.schema";
import { AIService, type AiMeta, type InterpretContext, type InterpretOutput } from "../ai.types";
import { buildSystemPrompt } from "../prompts";
import { parseAiResult } from "../intent-parser";

interface ChatCompletion {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatOpts {
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Provider NVIDIA NIM (endpoint OpenAI-compatível: POST {base}/chat/completions).
 * Modelo padrão: nvidia/nemotron-3-super-120b-a12b (bom em JSON estruturado, ~3-8s).
 * A chave nunca sai do backend.
 */
@Injectable()
export class NvidiaProvider extends AIService {
  private readonly logger = new Logger(NvidiaProvider.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  private async chatOnce(messages: ChatMsg[], opts: ChatOpts = {}): Promise<ChatCompletion> {
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(),
      opts.timeoutMs ?? this.env.AI_REQUEST_TIMEOUT_MS,
    );
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
          messages,
          temperature: this.env.AI_TEMPERATURE,
          max_tokens: opts.maxTokens ?? this.env.AI_MAX_TOKENS,
          response_format: { type: "json_object" },
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        this.logger.warn(`NVIDIA API ${res.status}: ${text.slice(0, 200)}`);
        const e = new Error(`NVIDIA API ${res.status}`) as Error & { retryable?: boolean };
        e.retryable = retryable;
        throw e;
      }
      return JSON.parse(text) as ChatCompletion;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Uma retentativa com backoff em 429/5xx/timeout. */
  private async chat(messages: ChatMsg[], opts: ChatOpts = {}): Promise<ChatCompletion> {
    try {
      return await this.chatOnce(messages, opts);
    } catch (err) {
      const e = err as Error & { retryable?: boolean; name?: string };
      if (e.retryable || e.name === "AbortError") {
        await new Promise((r) => setTimeout(r, 1500));
        return this.chatOnce(messages, opts);
      }
      throw err;
    }
  }

  /** Últimas trocas da conversa como turnos separados (contexto p/ follow-ups). */
  private historyMsgs(ctx: InterpretContext): ChatMsg[] {
    return ctx.history.slice(-8).map((h) => ({ role: h.role, content: h.text.slice(0, 500) }));
  }

  async interpret(text: string, ctx: InterpretContext): Promise<InterpretOutput> {
    const system = buildSystemPrompt(ctx);
    const messages: ChatMsg[] = [
      { role: "system", content: system },
      ...this.historyMsgs(ctx),
      { role: "user", content: text },
    ];
    const t0 = Date.now();

    let completion: ChatCompletion;
    try {
      completion = await this.chat(messages);
    } catch (err) {
      this.logger.error(`NVIDIA indisponível: ${(err as Error).message}`);
      return {
        result: {
          kind: "unknown",
          reason: "serviço de IA indisponível no momento",
        },
        meta: { provider: "nvidia", model: this.env.NVIDIA_MODEL, latencyMs: Date.now() - t0 },
      };
    }

    let content = completion.choices[0]?.message.content ?? "";
    let parsed = parseAiResult(content);

    // 1 tentativa de reparo se o JSON não bater no schema
    if (!parsed.ok) {
      this.logger.warn(`parse falhou (${parsed.error}); tentando reparo`);
      try {
        completion = await this.chat([
          {
            role: "system",
            content: `${system}\n\nA resposta anterior era inválida (${parsed.error}). Reenvie APENAS o JSON corrigido.`,
          },
          ...this.historyMsgs(ctx),
          { role: "user", content: text },
        ]);
        content = completion.choices[0]?.message.content ?? "";
        parsed = parseAiResult(content);
      } catch (err) {
        this.logger.warn(`reparo falhou: ${(err as Error).message}`);
      }
    }

    const latencyMs = Date.now() - t0;
    const meta = {
      provider: "nvidia",
      model: this.env.NVIDIA_MODEL,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      latencyMs,
      raw: content,
    };

    if (!parsed.ok || !parsed.value) {
      return { result: { kind: "unknown", reason: `interpretação inválida: ${parsed.error}` }, meta };
    }
    return { result: parsed.value, meta };
  }

  async analyze(system: string, user: string): Promise<{ text: string; meta: AiMeta }> {
    const t0 = Date.now();
    // o nemotron raciocina antes de responder — precisa de bem mais tokens/tempo
    const completion = await this.chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        maxTokens: this.env.AI_ANALYSIS_MAX_TOKENS,
        timeoutMs: this.env.AI_ANALYSIS_TIMEOUT_MS,
      },
    );
    return {
      text: completion.choices[0]?.message.content ?? "",
      meta: {
        provider: "nvidia",
        model: this.env.NVIDIA_MODEL,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        latencyMs: Date.now() - t0,
      },
    };
  }
}
