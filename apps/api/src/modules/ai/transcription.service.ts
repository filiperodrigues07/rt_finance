import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type Env } from "../../config/env.schema";

/**
 * Transcrição de áudio (voz → texto) via Groq — endpoint OpenAI-compatível de Whisper.
 * Sem `GROQ_API_KEY`, `transcribe` devolve `null` e o chamador degrada pedindo texto.
 * A chave nunca sai do backend.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return Boolean(this.env.GROQ_API_KEY);
  }

  private extFor(mimetype: string): string {
    if (mimetype.includes("mp4") || mimetype.includes("m4a")) return "m4a";
    if (mimetype.includes("mpeg") || mimetype.includes("mp3")) return "mp3";
    if (mimetype.includes("wav")) return "wav";
    if (mimetype.includes("webm")) return "webm";
    return "ogg"; // nota de voz do WhatsApp: audio/ogg; codecs=opus
  }

  private async once(audio: Buffer, mimetype: string): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const form = new FormData();
      const type = mimetype.split(";")[0] || "audio/ogg";
      form.append("file", new Blob([audio], { type }), `audio.${this.extFor(mimetype)}`);
      form.append("model", this.env.GROQ_STT_MODEL);
      form.append("language", "pt");
      form.append("response_format", "text");
      form.append("temperature", "0");

      const res = await fetch(`${this.env.GROQ_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { authorization: `Bearer ${this.env.GROQ_API_KEY}` },
        body: form,
      });
      const text = await res.text();
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const e = new Error(`Groq STT ${res.status}: ${text.slice(0, 200)}`) as Error & {
          retryable?: boolean;
        };
        e.retryable = retryable;
        throw e;
      }
      return text.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Retorna o texto transcrito, ou `null` se desabilitado / vazio / falhou. */
  async transcribe(audio: Buffer, mimetype: string): Promise<string | null> {
    if (!this.enabled || audio.length === 0) return null;
    try {
      let out: string;
      try {
        out = await this.once(audio, mimetype);
      } catch (err) {
        const e = err as Error & { retryable?: boolean; name?: string };
        if (e.retryable || e.name === "AbortError") {
          await new Promise((r) => setTimeout(r, 1200));
          out = await this.once(audio, mimetype);
        } else {
          throw err;
        }
      }
      return out.length > 0 ? out : null;
    } catch (err) {
      this.logger.warn(`transcrição falhou: ${(err as Error).message}`);
      return null;
    }
  }
}
