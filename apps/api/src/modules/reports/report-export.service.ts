import { readFileSync } from "node:fs";
import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fromCents, resolvePeriod, todayIso } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { ChartRendererService } from "../charts/chart-renderer.service";
import { ReportsService } from "./reports.service";

export interface ExportOpts {
  from?: string;
  to?: string;
  ids?: string[];
}

const TYPE_LABEL: Record<string, string> = { EXPENSE: "Despesa", INCOME: "Receita", TRANSFER: "Transferência" };
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Agendado",
  CONFIRMED: "Confirmado",
  CLEARED: "Compensado",
  CANCELED: "Cancelado",
};

const brl = (cents: number) =>
  fromCents(cents).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Fonte TTF com acentuação pt-BR completa. Procura, em ordem: DejaVu (Linux),
 * Segoe UI / Arial (Windows). Sem nenhuma → usa a Helvetica embutida do pdfkit.
 */
const FONT_CANDIDATES: [regular: string, bold: string][] = [
  ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"],
  ["C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\segoeuib.ttf"],
  ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\arialbd.ttf"],
];

function loadFonts(): { regular: Buffer; bold: Buffer } | null {
  for (const [r, b] of FONT_CANDIDATES) {
    try {
      return { regular: readFileSync(r), bold: readFileSync(b) };
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

@Injectable()
export class ReportExportService {
  private readonly fonts = loadFonts();

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly charts: ChartRendererService,
  ) {}

  private async range(householdId: string, opts: ExportOpts): Promise<{ from: string; to: string }> {
    if (opts.from && opts.to) return { from: opts.from, to: opts.to };
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { timezone: true },
    });
    return resolvePeriod("THIS_MONTH", { tz: h?.timezone ?? "America/Sao_Paulo", ref: todayIso() });
  }

  private async fetchRows(householdId: string, opts: ExportOpts, range: { from: string; to: string }) {
    return this.prisma.transaction.findMany({
      where: opts.ids?.length
        ? { householdId, id: { in: opts.ids } }
        : {
            householdId,
            date: { gte: dateOnly(range.from), lte: dateOnly(range.to) },
          },
      include: {
        category: { select: { name: true } },
        member: { select: { displayName: true } },
        account: { select: { name: true } },
        creditCard: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    });
  }

  // ------------------------------------------------------------------ Excel
  async xlsx(householdId: string, opts: ExportOpts): Promise<Buffer> {
    const range = await this.range(householdId, opts);
    const [rows, dash] = await Promise.all([
      this.fetchRows(householdId, opts, range),
      this.reports.dashboard(householdId, { from: range.from, to: range.to }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "RT Finance";
    wb.created = new Date();

    const money = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

    const tx = wb.addWorksheet("Transações");
    tx.columns = [
      { header: "Data", key: "date", width: 12 },
      { header: "Vencimento", key: "due", width: 12 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Descrição", key: "desc", width: 40 },
      { header: "Categoria", key: "cat", width: 18 },
      { header: "Responsável", key: "member", width: 14 },
      { header: "Meio", key: "means", width: 18 },
      { header: "Valor", key: "value", width: 14, style: { numFmt: money } },
      { header: "Status", key: "status", width: 13 },
    ];
    for (const t of rows) {
      tx.addRow({
        date: brDate(toIsoDate(t.date)),
        due: t.dueDate ? brDate(toIsoDate(t.dueDate)) : "",
        type: TYPE_LABEL[t.type] ?? t.type,
        desc: t.description,
        cat: t.category?.name ?? "Sem categoria",
        member: t.member.displayName,
        means: t.creditCard?.name ?? t.account?.name ?? "",
        value: (t.type === "EXPENSE" ? -1 : 1) * fromCents(t.amountCents),
        status: STATUS_LABEL[t.status] ?? t.status,
      });
    }
    tx.getRow(1).font = { bold: true };
    tx.views = [{ state: "frozen", ySplit: 1 }];

    const cat = wb.addWorksheet("Resumo por categoria");
    cat.columns = [
      { header: "Categoria", key: "name", width: 24 },
      { header: "Gasto", key: "cents", width: 16, style: { numFmt: money } },
      { header: "% do total", key: "pct", width: 12, style: { numFmt: "0.0%" } },
    ];
    for (const c of dash.byCategory) {
      cat.addRow({ name: c.name, cents: fromCents(c.cents), pct: (c.percent ?? 0) / 100 });
    }
    cat.getRow(1).font = { bold: true };

    const mem = wb.addWorksheet("Resumo por pessoa");
    mem.columns = [
      { header: "Pessoa", key: "name", width: 20 },
      { header: "Gasto", key: "cents", width: 16, style: { numFmt: money } },
    ];
    for (const m of dash.byMember) mem.addRow({ name: m.displayName, cents: fromCents(m.cents) });
    mem.getRow(1).font = { bold: true };

    const tot = wb.addWorksheet("Totais");
    tot.columns = [
      { header: "Indicador", key: "k", width: 28 },
      { header: "Valor", key: "v", width: 18, style: { numFmt: money } },
    ];
    tot.addRows([
      { k: `Período`, v: `${brDate(range.from)} a ${brDate(range.to)}` },
      { k: "Receitas", v: fromCents(dash.incomeCents) },
      { k: "Despesas", v: fromCents(dash.expenseCents) },
      { k: "Resultado", v: fromCents(dash.incomeCents - dash.expenseCents) },
      { k: "Saldo em contas", v: fromCents(dash.balanceCents) },
      { k: "Faturas em aberto", v: fromCents(dash.invoicesOpenCents) },
    ]);
    tot.getRow(1).font = { bold: true };

    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  // -------------------------------------------------------------------- PDF
  async pdf(householdId: string, opts: ExportOpts): Promise<Buffer> {
    const range = await this.range(householdId, opts);
    const [rows, dash, household] = await Promise.all([
      this.fetchRows(householdId, opts, range),
      this.reports.dashboard(householdId, { from: range.from, to: range.to }),
      this.prisma.household.findUnique({ where: { id: householdId }, select: { name: true } }),
    ]);

    const donutPng =
      dash.byCategory.filter((c) => c.cents > 0).length > 0
        ? await this.charts
            .donut(
              "Gastos por categoria",
              dash.byCategory
                .filter((c) => c.cents > 0)
                .slice(0, 8)
                .map((c) => ({ label: c.name, value: c.cents, color: c.color })),
            )
            .catch(() => null)
        : null;

    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Relatório RT Finance" } });
    if (this.fonts) {
      doc.registerFont("body", this.fonts.regular);
      doc.registerFont("bold", this.fonts.bold);
      doc.font("body");
    }
    const F = (weight: "body" | "bold") => (this.fonts ? weight : weight === "bold" ? "Helvetica-Bold" : "Helvetica");
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const accent = "#2563EB";
    const muted = "#6B7280";
    const L = 48;

    // cabeçalho
    doc.font(F("bold")).fillColor(accent).fontSize(22).text("RT", L, doc.y, { continued: true });
    doc.fillColor("#111827").text(" Finance");
    doc.moveDown(0.2);
    doc.font(F("bold")).fillColor("#111827").fontSize(15).text("Relatório do período");
    doc
      .font(F("body"))
      .fillColor(muted)
      .fontSize(10)
      .text(`${household?.name ?? ""} · ${brDate(range.from)} a ${brDate(range.to)}`)
      .text(`Gerado em ${brDate(todayIso())}`);
    doc.moveDown(1);

    // KPIs — linha horizontal, mesmo Y
    const kpis: [string, string][] = [
      ["Receitas", brl(dash.incomeCents)],
      ["Despesas", brl(dash.expenseCents)],
      ["Resultado", brl(dash.incomeCents - dash.expenseCents)],
      ["Saldo em contas", brl(dash.balanceCents)],
      ["Faturas abertas", brl(dash.invoicesOpenCents)],
    ];
    const kw = (doc.page.width - 2 * L) / kpis.length;
    const ky = doc.y;
    kpis.forEach(([k, v], i) => {
      const kx = L + i * kw;
      doc.font(F("body")).fillColor(muted).fontSize(7.5).text(k.toUpperCase(), kx, ky, { width: kw - 6 });
      doc.font(F("bold")).fillColor("#111827").fontSize(11).text(v, kx, ky + 12, { width: kw - 6 });
    });
    doc.x = L;
    doc.y = ky + 40;

    if (donutPng) {
      try {
        doc.image(donutPng, { fit: [doc.page.width - 96, 240], align: "center" });
        doc.moveDown(1);
      } catch {
        /* ignora imagem inválida */
      }
    }

    // resumo por categoria
    doc.font(F("bold")).fillColor("#111827").fontSize(12).text("Gastos por categoria", L, doc.y);
    doc.moveDown(0.4);
    doc.font(F("body"));
    for (const c of dash.byCategory.filter((x) => x.cents > 0).slice(0, 12)) {
      doc
        .fillColor("#374151")
        .fontSize(10)
        .text(c.name, L, doc.y, { continued: true })
        .fillColor(muted)
        .text(`   ${brl(c.cents)}  (${(c.percent ?? 0).toFixed(0)}%)`);
    }
    doc.moveDown(1);

    // transações
    doc.addPage();
    doc.font(F("bold")).fillColor("#111827").fontSize(12).text(`Transações (${rows.length})`, L, doc.y);
    doc.moveDown(0.5);
    doc.font(F("body"));
    const cols = [
      { label: "Data", w: 55 },
      { label: "Descrição", w: 200 },
      { label: "Categoria", w: 95 },
      { label: "Valor", w: 80 },
      { label: "Status", w: 65 },
    ];
    const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
    const charBudget = [10, 34, 16, 13, 11];
    const drawRow = (cells: string[], opts2: { header?: boolean } = {}) => {
      const y = doc.y;
      let x = L;
      doc.font(F(opts2.header ? "bold" : "body")).fontSize(8).fillColor(opts2.header ? muted : "#374151");
      cells.forEach((cell, i) => {
        doc.text(clip(cell, charBudget[i]!), x, y, { width: cols[i]!.w - 4, lineBreak: false });
        x += cols[i]!.w;
      });
      doc.y = y + 12;
      if (doc.y > doc.page.height - 60) doc.addPage();
    };
    drawRow(cols.map((c) => c.label), { header: true });
    for (const t of rows) {
      drawRow([
        brDate(toIsoDate(t.date)),
        t.description,
        t.category?.name ?? "—",
        `${t.type === "EXPENSE" ? "-" : "+"}${brl(t.amountCents)}`,
        STATUS_LABEL[t.status] ?? t.status,
      ]);
    }

    doc.end();
    return done;
  }
}
