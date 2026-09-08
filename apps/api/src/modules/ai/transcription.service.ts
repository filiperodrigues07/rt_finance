import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type Env } from "../../config/env.schema";

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; reason: "disabled" | "too_large" | "bad_format" | "transient" };

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

  /** Uma chamada ao Groq. Lança Error com `.kind` = "transient" | "bad_format". */
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
        const kind = res.status === 429 || res.status >= 500 ? "transient" : "bad_format";
        const e = new Error(`Groq STT ${res.status}: ${text.slice(0, 200)}`) as Error & {
          kind?: "transient" | "bad_format";
        };
        e.kind = kind;
        throw e;
      }
      return text.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async transcribe(audio: Buffer, mimetype: string): Promise<TranscriptionResult> {
    if (!this.enabled) return { ok: false, reason: "disabled" };
    if (audio.length === 0) return { ok: false, reason: "transient" };
    if (audio.length > this.env.AUDIO_MAX_BYTES) return { ok: false, reason: "too_large" };

    try {
      let out: string;
      try {
        out = await this.once(audio, mimetype);
      } catch (err) {
        const e = err as Error & { kind?: string; name?: string };
        if (e.kind === "transient" || e.name === "AbortError") {
          await new Promise((r) => setTimeout(r, 800));
          out = await this.once(audio, mimetype);
        } else {
          throw err;
        }
      }
      return out.length > 0 ? { ok: true, text: out } : { ok: false, reason: "transient" };
    } catch (err) {
      const e = err as Error & { kind?: string; name?: string };
      this.logger.warn(`transcrição falhou: ${e.message}`);
      const reason = e.kind === "bad_format" ? "bad_format" : "transient";
      return { ok: false, reason };
    }
  }
}
