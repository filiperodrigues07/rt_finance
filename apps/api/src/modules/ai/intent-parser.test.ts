import { describe, it, expect } from "vitest";
import { extractJson, parseAiResult } from "./intent-parser";

describe("extractJson", () => {
  it("passa JSON puro", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
  it("remove cercas de markdown", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("remove bloco <think>", () => {
    expect(extractJson('<think>hmm...</think>\n{"a":1}')).toBe('{"a":1}');
  });
  it("isola o objeto quando há texto ao redor", () => {
    expect(extractJson('Aqui está: {"a":1} espero ter ajudado')).toBe('{"a":1}');
  });
  it("retorna null sem chaves", () => {
    expect(extractJson("sem json aqui")).toBeNull();
  });
});

describe("parseAiResult", () => {
  it("aceita create_expense válido", () => {
    const r = parseAiResult(
      JSON.stringify({
        kind: "create_expense",
        amountCents: 8500,
        description: "Mercado",
        categoryHint: "Mercado",
        date: "2026-09-03",
        paymentHint: null,
        memberHint: null,
        confidence: 0.95,
        ambiguous: false,
        clarification: null,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.value?.kind).toBe("create_expense");
  });

  it("aceita query com defaults nos params", () => {
    const r = parseAiResult(
      '{"kind":"query","template":"MONTHLY_SUMMARY","params":{"period":"THIS_MONTH"},"wantsChart":false,"confidence":0.9}',
    );
    expect(r.ok).toBe(true);
  });

  it("aceita ACCOUNT_BALANCE com accountHint", () => {
    const r = parseAiResult(
      '{"kind":"query","template":"ACCOUNT_BALANCE","params":{"period":"THIS_MONTH","accountHint":"Nubank"},"wantsChart":false,"confidence":0.9}',
    );
    expect(r.ok).toBe(true);
    if (r.value?.kind === "query") {
      expect(r.value.template).toBe("ACCOUNT_BALANCE");
      expect(r.value.params.accountHint).toBe("Nubank");
    }
  });

  it("rejeita kind desconhecido", () => {
    const r = parseAiResult('{"kind":"transfer_money","amountCents":100}');
    expect(r.ok).toBe(false);
  });

  it("rejeita valor negativo", () => {
    const r = parseAiResult(
      '{"kind":"create_expense","amountCents":-5,"description":"x","date":"2026-09-03","categoryHint":null,"paymentHint":null,"memberHint":null,"confidence":0.5,"ambiguous":false,"clarification":null}',
    );
    expect(r.ok).toBe(false);
  });

  it("lida com JSON malformado", () => {
    const r = parseAiResult("{isso nao e json}");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
