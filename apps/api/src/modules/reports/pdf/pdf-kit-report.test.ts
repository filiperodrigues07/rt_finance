import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PdfKitReport, type PdfFonts, type TxRow } from "./pdf-kit-report";

function fonts(): PdfFonts | null {
  try {
    const file = (w: number) =>
      readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff`));
    return { regular: file(400), semibold: file(600), bold: file(700) };
  } catch {
    return null;
  }
}

const base = {
  householdName: "Casa RT",
  range: { from: "2026-09-01", to: "2026-09-30" },
  tz: "America/Sao_Paulo",
  logoPng: null,
};

describe("PdfKitReport", () => {
  it("gera um PDF válido com dados", async () => {
    const rows: TxRow[] = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
      description: `Lançamento de teste número ${i} com uma descrição propositalmente longa para forçar quebra de linha`,
      category: i % 2 ? "Mercado" : "Transporte",
      amountCents: (i + 1) * 1234,
      isExpense: i % 3 !== 0,
      status: "Confirmado",
    }));

    const buf = await new PdfKitReport({ ...base, fonts: fonts() })
      .cover()
      .kpis([
        { label: "Receitas", value: "R$ 5.000,00", tone: "pos" },
        { label: "Despesas", value: "R$ 3.200,00", tone: "neg" },
        { label: "Resultado", value: "R$ 1.800,00", tone: "pos" },
        { label: "Saldo em contas", value: "R$ 12.000,00" },
        { label: "Faturas abertas", value: "R$ 900,00" },
      ])
      .barList("Gastos por categoria", [
        { label: "Mercado", value: 120000, percent: 60 },
        { label: "Transporte", value: 80000, percent: 40 },
      ])
      .barList("Gastos por pessoa", [{ label: "Filipe", value: 200000 }])
      .transactions(rows)
      .build();

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(3000);
  });

  it("não quebra com seções vazias", async () => {
    const buf = await new PdfKitReport({ ...base, fonts: null })
      .cover()
      .kpis([{ label: "Resultado", value: "R$ 0,00" }])
      .image(null)
      .barList("Gastos por categoria", [])
      .barList("Gastos por pessoa", [])
      .transactions([])
      .build();
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
