import { readFileSync } from "node:fs";
import { Injectable, Logger } from "@nestjs/common";
import ExcelJS from "exceljs";
import { fromCents, resolvePeriod, todayIso } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { dateOnly, toIsoDate } from "../../common/date-only";
import { ChartRendererService } from "../charts/chart-renderer.service";
import { ReportsService } from "./reports.service";
import { PdfKitReport, type PdfFonts, type TxRow } from "./pdf/pdf-kit-report";
import { renderLogoPng } from "./pdf/brand";

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

/** Carrega a fonte Inter empacotada (@fontsource/inter — .woff, lida pelo pdfkit/fontkit). */
function loadInterFonts(): PdfFonts | null {
  try {
    const file = (weight: number) =>
      readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`));
    return { regular: file(400), semibold: file(600), bold: file(700) };
  } catch {
    return null;
  }
}

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);
  private readonly fonts = loadInterFonts();
  private logoPng: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly charts: ChartRendererService,
  ) {
    if (!this.fonts) {
      this.logger.warn("Inter não encontrada — PDF usará Helvetica (sem cobertura completa de acentos)");
    }
  }

  private async logo(): Promise<Buffer | null> {
    if (this.logoPng) return this.logoPng;
    try {
      this.logoPng = await renderLogoPng(900);
    } catch (err) {
      this.logger.warn(`falha ao rasterizar o logo: ${(err as Error).message}`);
      this.logoPng = null;
    }
    return this.logoPng;
  }

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
    const [rows, dash, household, tzRow, logoPng] = await Promise.all([
      this.fetchRows(householdId, opts, range),
      this.reports.dashboard(householdId, { from: range.from, to: range.to }),
      this.prisma.household.findUnique({ where: { id: householdId }, select: { name: true } }),
      this.prisma.household.findUnique({ where: { id: householdId }, select: { timezone: true } }),
      this.logo(),
    ]);
    const tz = tzRow?.timezone ?? "America/Sao_Paulo";

    const topCats = dash.byCategory.filter((c) => c.cents > 0).slice(0, 10);
    const donutPng =
      topCats.length > 0
        ? await this.charts
            .donut(
              "Gastos por categoria",
              topCats.slice(0, 8).map((c) => ({ label: c.name, value: c.cents, color: c.color })),
              { theme: "light" },
            )
            .catch(() => null)
        : null;

    const resultCents = dash.incomeCents - dash.expenseCents;
    const report = new PdfKitReport({
      householdName: household?.name ?? "RT Finance",
      range,
      tz,
      fonts: this.fonts,
      logoPng,
    });

    report
      .cover()
      .kpis([
        { label: "Receitas", value: brl(dash.incomeCents), tone: "pos" },
        { label: "Despesas", value: brl(dash.expenseCents), tone: "neg" },
        { label: "Resultado", value: brl(resultCents), tone: resultCents >= 0 ? "pos" : "neg" },
        { label: "Saldo em contas", value: brl(dash.balanceCents) },
        { label: "Faturas abertas", value: brl(dash.invoicesOpenCents) },
      ])
      .image(donutPng, 220)
      .barList(
        "Gastos por categoria",
        topCats.map((c) => ({ label: c.name, value: c.cents, percent: c.percent })),
      )
      .barList(
        "Gastos por pessoa",
        dash.byMember
          .filter((m) => m.cents > 0)
          .map((m) => ({ label: m.displayName, value: m.cents })),
        "Ninguém registrou gastos no período.",
      );

    const txRows: TxRow[] = rows.map((t) => ({
      date: toIsoDate(t.date),
      description: t.description,
      category: t.category?.name ?? "—",
      amountCents: t.amountCents,
      isExpense: t.type === "EXPENSE",
      status: STATUS_LABEL[t.status] ?? t.status,
    }));
    report.transactions(txRows);

    return report.build();
  }
}
