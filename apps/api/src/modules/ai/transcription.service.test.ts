import { describe, it, expect, vi, afterEach } from "vitest";
import { TranscriptionService } from "./transcription.service";
import type { Env } from "../../config/env.schema";

const env = (over: Partial<Env> = {}): Env =>
  ({
    GROQ_API_KEY: "k",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_STT_MODEL: "whisper-large-v3",
    AUDIO_MAX_BYTES: 8_000_000,
    ...over,
  }) as Env;

const svc = (over?: Partial<Env>) => new TranscriptionService(env(over));
const audio = (n = 100) => Buffer.alloc(n, 1);

afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: { status: number; body?: string }[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const r = responses[Math.min(i++, responses.length - 1)]!;
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        text: async () => r.body ?? "",
      } as Response;
    }),
  );
}

describe("TranscriptionService.transcribe", () => {
  it("disabled quando não há GROQ_API_KEY", async () => {
    const r = await svc({ GROQ_API_KEY: undefined }).transcribe(audio(), "audio/ogg");
    expect(r).toEqual({ ok: false, reason: "disabled" });
  });

  it("too_large acima do teto", async () => {
    const r = await svc({ AUDIO_MAX_BYTES: 50 }).transcribe(audio(200), "audio/ogg");
    expect(r).toEqual({ ok: false, reason: "too_large" });
  });

  it("bad_format em 4xx (não 429)", async () => {
    mockFetch({ status: 400, body: "unsupported" });
    const r = await svc().transcribe(audio(), "audio/ogg");
    expect(r).toEqual({ ok: false, reason: "bad_format" });
  });

  it("transient em 429 mesmo após a retentativa", async () => {
    mockFetch({ status: 429 }, { status: 429 });
    const r = await svc().transcribe(audio(), "audio/ogg");
    expect(r).toEqual({ ok: false, reason: "transient" });
  });

  it("happy path devolve o texto", async () => {
    mockFetch({ status: 200, body: "  gastei 50 no mercado  " });
    const r = await svc().transcribe(audio(), "audio/ogg");
    expect(r).toEqual({ ok: true, text: "gastei 50 no mercado" });
  });

  it("texto vazio vira transient", async () => {
    mockFetch({ status: 200, body: "   " });
    const r = await svc().transcribe(audio(), "audio/ogg");
    expect(r).toEqual({ ok: false, reason: "transient" });
  });
});
