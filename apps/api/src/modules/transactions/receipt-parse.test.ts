import { describe, it, expect } from "vitest";
import { parseReceipt } from "./receipt-parse";

describe("parseReceipt", () => {
  it("pega o valor do 'total' e a data dd/mm/aaaa", () => {
    const r = parseReceipt(
      ["MERCADO SÃO JOÃO", "Data: 09/09/2026 14:32", "Itens: 12", "SUBTOTAL 120,00", "TOTAL R$ 137,45"].join("\n"),
    );
    expect(r.amountCents).toBe(13745);
    expect(r.date).toBe("2026-09-09");
    expect(r.description).toBe("MERCADO SÃO JOÃO");
  });

  it("sem 'total' usa o maior valor plausível", () => {
    const r = parseReceipt("Uber viagem\nTarifa 18,90\nTaxa 2,10\nCobrado 21,00");
    expect(r.amountCents).toBe(2100);
  });

  it("data por extenso", () => {
    const r = parseReceipt("Recibo\n5 de março de 2026\nValor total 90,00");
    expect(r.date).toBe("2026-03-05");
    expect(r.amountCents).toBe(9000);
  });

  it("detecta boleto pela linha digitável", () => {
    const r = parseReceipt("34191.79001 01043.510047 91020.150008 5 98110000012345");
    expect(r.isBoleto).toBe(true);
  });

  it("texto vazio não quebra", () => {
    expect(parseReceipt("")).toEqual({ isBoleto: false });
  });
});
