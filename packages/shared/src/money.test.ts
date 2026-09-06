import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatBRL, splitInstallments, sumCents, percentOf } from "./money.js";

describe("toCents", () => {
  it("converte número", () => {
    expect(toCents(85)).toBe(8500);
    expect(toCents(59.9)).toBe(5990);
    expect(toCents(0.1)).toBe(10);
  });
  it("converte string pt-BR", () => {
    expect(toCents("1.234,56")).toBe(123456);
    expect(toCents("R$ 2.400,00")).toBe(240000);
    expect(toCents("150")).toBe(15000);
  });
  it("converte string en", () => {
    expect(toCents("1234.56")).toBe(123456);
  });
  it("rejeita lixo", () => {
    expect(() => toCents("abc")).toThrow();
  });
});

describe("fromCents / formatBRL", () => {
  it("volta para reais", () => {
    expect(fromCents(8500)).toBe(85);
  });
  it("formata BRL", () => {
    expect(formatBRL(240000).replace(/ /g, " ")).toBe("R$ 2.400,00");
    expect(formatBRL(5990).replace(/ /g, " ")).toBe("R$ 59,90");
  });
});

describe("splitInstallments", () => {
  it("divide exato", () => {
    expect(splitInstallments(360000, 12)).toEqual(Array(12).fill(30000));
  });
  it("distribui o resto nas primeiras parcelas", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
  });
  it("soma sempre igual ao total", () => {
    for (const [total, n] of [
      [100000, 7],
      [99999, 13],
      [123457, 12],
      [1, 1],
    ] as const) {
      expect(sumCents(splitInstallments(total, n))).toBe(total);
    }
  });
  it("valida entradas", () => {
    expect(() => splitInstallments(0, 3)).toThrow();
    expect(() => splitInstallments(1000, 0)).toThrow();
    expect(() => splitInstallments(10.5, 3)).toThrow();
  });
});

describe("percentOf", () => {
  it("calcula percentual inteiro", () => {
    expect(percentOf(1250, 1500)).toBe(83);
    expect(percentOf(0, 0)).toBe(0);
  });
});
