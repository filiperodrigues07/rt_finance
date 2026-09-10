import { describe, it, expect } from "vitest";
import { fastPath } from "./fast-path";

const ctx = { todayIso: "2026-09-09", members: ["Filipe", "Julia"], hasPending: false };

describe("fastPath — despesa com cartão", () => {
  it("extrai o cartão citado (com acento) para paymentHint", () => {
    const r = fastPath("gastei 88 com fast food no cartão Itaú", ctx);
    expect(r?.kind).toBe("create_expense");
    if (r?.kind === "create_expense") {
      expect(r.amountCents).toBe(8800);
      expect(r.paymentHint).toBe("Itaú");
      expect(r.description).toBe("Fast food");
    }
  });

  it("extrai o cartão sem acento", () => {
    const r = fastPath("paguei 120 no cartao nubank", ctx);
    expect(r?.kind === "create_expense" && r.paymentHint).toBe("nubank");
  });

  it("mantém pix/dinheiro/débito como paymentHint", () => {
    const r = fastPath("paguei 30 de uber no pix", ctx);
    expect(r?.kind === "create_expense" && r.paymentHint).toBe("pix");
  });

  it("sem meio de pagamento citado, paymentHint fica null", () => {
    const r = fastPath("gastei 25 no mercado", ctx);
    expect(r?.kind === "create_expense" && r.paymentHint).toBeNull();
  });

  it("parcelamento não vira despesa simples (cai no LLM)", () => {
    expect(fastPath("comprei tv 2400 em 12x no cartão Itaú", ctx)).toBeNull();
  });
});
