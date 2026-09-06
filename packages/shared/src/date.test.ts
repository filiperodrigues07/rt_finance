import { describe, it, expect } from "vitest";
import { invoiceCompetence, clampDayToMonth, resolvePeriod, addMonths } from "./date.js";

describe("invoiceCompetence (Nubank: closing 10, due 17)", () => {
  it("compra antes do fechamento cai na fatura do mês", () => {
    expect(invoiceCompetence({ date: "2026-09-03", closingDay: 10, dueDay: 17 })).toEqual({
      referenceMonth: "2026-09-01",
      closingDate: "2026-09-10",
      dueDate: "2026-09-17",
    });
  });
  it("compra depois do fechamento cai na fatura do mês seguinte", () => {
    expect(invoiceCompetence({ date: "2026-09-12", closingDay: 10, dueDay: 17 })).toEqual({
      referenceMonth: "2026-10-01",
      closingDate: "2026-10-10",
      dueDate: "2026-10-17",
    });
  });
  it("no dia do fechamento ainda entra na fatura corrente", () => {
    expect(invoiceCompetence({ date: "2026-09-10", closingDay: 10, dueDay: 17 }).referenceMonth).toBe(
      "2026-09-01",
    );
  });
});

describe("invoiceCompetence (vencimento antes do fechamento: closing 25, due 5)", () => {
  it("vence no mês seguinte ao da competência", () => {
    expect(invoiceCompetence({ date: "2026-09-20", closingDay: 25, dueDay: 5 })).toEqual({
      referenceMonth: "2026-09-01",
      closingDate: "2026-09-25",
      dueDate: "2026-10-05",
    });
  });
});

describe("clampDayToMonth", () => {
  it("faz clamp de 31 em fevereiro", () => {
    expect(clampDayToMonth("2026-02-01", 31)).toBe("2026-02-28");
    expect(clampDayToMonth("2028-02-01", 31)).toBe("2028-02-29");
  });
  it("mantém dia válido", () => {
    expect(clampDayToMonth("2026-09-01", 10)).toBe("2026-09-10");
  });
});

describe("resolvePeriod", () => {
  it("THIS_MONTH", () => {
    expect(resolvePeriod("THIS_MONTH", { ref: "2026-09-15" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
  it("LAST_MONTH", () => {
    expect(resolvePeriod("LAST_MONTH", { ref: "2026-03-10" })).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });
  it("CUSTOM exige from/to", () => {
    expect(() => resolvePeriod("CUSTOM", {})).toThrow();
  });
});

describe("addMonths", () => {
  it("soma meses preservando YYYY-MM-DD", () => {
    expect(addMonths("2026-09-30", 1)).toBe("2026-10-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});
