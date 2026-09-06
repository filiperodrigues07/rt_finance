import { AiResult } from "@rt-finance/shared";

/** Remove cercas de código, blocos <think> e texto ao redor, e tenta isolar o objeto JSON. */
export function extractJson(raw: string): string | null {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return s.slice(start, end + 1);
}

export interface ParseResult {
  ok: boolean;
  value?: AiResult;
  error?: string;
}

/** Faz o parse defensivo da saída do modelo para AiResult (Zod). */
export function parseAiResult(raw: string): ParseResult {
  const json = extractJson(raw);
  if (!json) return { ok: false, error: "sem JSON na resposta" };

  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }

  const parsed = AiResult.safeParse(obj);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { ok: true, value: parsed.data };
}
