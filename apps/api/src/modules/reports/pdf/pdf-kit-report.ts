import PDFDocument from "pdfkit";
import { formatBRL, formatDateBR, monthLabelBR } from "@rt-finance/shared";
import { BRAND } from "./brand";

export interface PdfFonts {
  regular: Buffer;
  semibold: Buffer;
  bold: Buffer;
}

interface Ctx {
  householdName: string;
  range: { from: string; to: string };
  tz: string;
  fonts: PdfFonts | null;
  logoPng: Buffer | null;
}

export interface KpiItem {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}
export interface BarItem {
  label: string;
  value: number; // centavos
  percent?: number;
}
export interface TxRow {
  date: string; // ISO YYYY-MM-DD
  description: string;
  category: string;
  amountCents: number;
  isExpense: boolean;
  status: string;
}

const A4 = { w: 595.28, h: 841.89 };
const M = { top: 92, bottom: 62, left: 44, right: 44 };
const CONTENT_W = A4.w - M.left - M.right;

/** Construtor do relatório em PDF com a identidade visual do RT Finance. */
export class PdfKitReport {
  private readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];
  private readonly done: Promise<Buffer>;
  private pageNo = 0;
  private readonly hasFonts: boolean;

  constructor(private readonly ctx: Ctx) {
    this.hasFonts = !!ctx.fonts;
    this.doc = new PDFDocument({
      size: "A4",
      margins: M,
      bufferPages: true,
      autoFirstPage: false,
      info: { Title: "Relatório RT Finance", Author: "RT Finance" },
    });
    if (ctx.fonts) {
      this.doc.registerFont("R", ctx.fonts.regular);
      this.doc.registerFont("SB", ctx.fonts.semibold);
      this.doc.registerFont("B", ctx.fonts.bold);
    }
    this.doc.on("data", (c: Buffer) => this.chunks.push(c));
    this.done = new Promise((resolve) => this.doc.on("end", () => resolve(Buffer.concat(this.chunks))));
    this.doc.on("pageAdded", () => {
      this.pageNo += 1;
      if (this.pageNo > 1) this.runningHeader();
    });
    this.doc.addPage(); // página 1 (capa)
  }

  private f(w: "R" | "SB" | "B"): string {
    if (this.hasFonts) return w;
    return w === "R" ? "Helvetica" : "Helvetica-Bold";
  }

  private get rangeLabel(): string {
    const { from, to } = this.ctx.range;
    const tz = this.ctx.tz;
    return `${formatDateBR(from, tz)} – ${formatDateBR(to, tz)}`;
  }

  // ---------------------------------------------------------------- chrome
  private runningHeader(): void {
    const d = this.doc;
    const y = 34;
    if (this.ctx.logoPng) {
      try {
        d.image(this.ctx.logoPng, M.left, y - 6, { height: 20 });
      } catch {
        /* ignora logo inválido */
      }
    } else {
      d.font(this.f("B")).fontSize(11).fillColor(BRAND.accent).text("RT", M.left, y, { continued: true });
      d.fillColor(BRAND.ink).text(" Finance");
    }
    d.font(this.f("R"))
      .fontSize(8)
      .fillColor(BRAND.muted)
      .text(`${this.ctx.householdName} · ${this.rangeLabel}`, M.left, y + 1, {
        width: CONTENT_W,
        align: "right",
      });
    d.moveTo(M.left, y + 22)
      .lineTo(A4.w - M.right, y + 22)
      .strokeColor(BRAND.line)
      .lineWidth(0.75)
      .stroke();
    d.x = M.left;
    d.y = M.top;
  }

  private stampFooters(): void {
    const d = this.doc;
    const range = d.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      d.switchToPage(range.start + i);
      const y = A4.h - 44;
      d.moveTo(M.left, y).lineTo(A4.w - M.right, y).strokeColor(BRAND.line).lineWidth(0.75).stroke();
      d.font(this.f("R")).fontSize(7.5).fillColor(BRAND.muted);
      d.text("RT Finance · assistente do casal", M.left, y + 6, { width: CONTENT_W / 3, align: "left" });
      d.text(`Gerado em ${formatDateBR(new Date().toISOString().slice(0, 10), this.ctx.tz)}`, M.left, y + 6, {
        width: CONTENT_W,
        align: "center",
      });
      d.text(`Página ${i + 1} de ${range.count}`, M.left, y + 6, { width: CONTENT_W, align: "right" });
    }
  }

  private ensureSpace(h: number): void {
    if (this.doc.y + h > A4.h - M.bottom) this.doc.addPage();
  }

  private sectionTitle(text: string): void {
    this.ensureSpace(40);
    this.doc.font(this.f("SB")).fontSize(12).fillColor(BRAND.ink).text(text, M.left, this.doc.y);
    this.doc.moveDown(0.35);
  }

  // ---------------------------------------------------------------- blocos
  cover(): this {
    const d = this.doc;
    d.y = 88;
    if (this.ctx.logoPng) {
      try {
        d.image(this.ctx.logoPng, M.left, d.y, { height: 46 });
        d.y += 62;
      } catch {
        d.y += 8;
      }
    }
    d.font(this.f("B")).fontSize(22).fillColor(BRAND.ink).text("Relatório do período", M.left, d.y);
    d.moveDown(0.25);
    d.font(this.f("R")).fontSize(11).fillColor(BRAND.muted);
    const monthly = monthLabelBR(this.ctx.range.from, this.ctx.tz);
    d.text(`${this.ctx.householdName}  ·  ${monthly}`, { width: CONTENT_W });
    d.font(this.f("R")).fontSize(9).fillColor(BRAND.muted).text(this.rangeLabel);
    d.moveDown(0.6);
    d.moveTo(M.left, d.y).lineTo(M.left + 64, d.y).strokeColor(BRAND.accent).lineWidth(3).stroke();
    d.moveDown(1.2);
    d.x = M.left;
    return this;
  }

  kpis(items: KpiItem[]): this {
    const d = this.doc;
    this.ensureSpace(78);
    const gap = 10;
    const cw = (CONTENT_W - gap * (items.length - 1)) / items.length;
    const y = d.y;
    const ch = 56;
    items.forEach((it, i) => {
      const x = M.left + i * (cw + gap);
      d.roundedRect(x, y, cw, ch, 8).fillColor(BRAND.zebra).fill();
      d.font(this.f("SB")).fontSize(7).fillColor(BRAND.muted).text(it.label.toUpperCase(), x + 10, y + 10, {
        width: cw - 20,
        characterSpacing: 0.4,
      });
      const vc = it.tone === "pos" ? BRAND.pos : it.tone === "neg" ? BRAND.neg : BRAND.ink;
      d.font(this.f("B")).fontSize(cw > 100 ? 12 : 10).fillColor(vc).text(it.value, x + 10, y + 26, {
        width: cw - 20,
        lineBreak: false,
      });
    });
    d.x = M.left;
    d.y = y + ch + 20;
    return this;
  }

  image(png: Buffer | null, maxH = 220): this {
    if (!png) return this;
    this.ensureSpace(maxH + 16);
    try {
      this.doc.image(png, M.left, this.doc.y, { fit: [CONTENT_W, maxH], align: "center" });
      this.doc.y += maxH + 8;
      this.doc.x = M.left;
    } catch {
      /* ignora imagem inválida */
    }
    return this;
  }

  barList(title: string, items: BarItem[], emptyText = "Sem dados no período."): this {
    this.sectionTitle(title);
    const d = this.doc;
    if (items.length === 0) {
      d.font(this.f("R")).fontSize(9.5).fillColor(BRAND.muted).text(emptyText, M.left, d.y);
      d.moveDown(1);
      d.x = M.left;
      return this;
    }
    const max = Math.max(...items.map((i) => i.value), 1);
    const labelW = 130;
    const valueW = 120;
    const barW = CONTENT_W - labelW - valueW - 16;
    for (const it of items) {
      this.ensureSpace(20);
      const y = d.y;
      d.font(this.f("R")).fontSize(9).fillColor(BRAND.ink).text(it.label, M.left, y + 1, {
        width: labelW - 6,
        ellipsis: true,
        lineBreak: false,
      });
      const bx = M.left + labelW;
      d.roundedRect(bx, y + 2, barW, 9, 2).fillColor(BRAND.line).fill();
      const w = Math.max(2, (it.value / max) * barW);
      d.roundedRect(bx, y + 2, w, 9, 2).fillColor(BRAND.accent).fill();
      const pct = it.percent != null ? `  (${it.percent.toFixed(0)}%)` : "";
      d.font(this.f("SB")).fontSize(9).fillColor(BRAND.ink).text(`${formatBRL(it.value)}${pct}`, bx + barW + 16, y + 1, {
        width: valueW,
        align: "right",
        lineBreak: false,
      });
      d.y = y + 16;
    }
    d.moveDown(0.8);
    d.x = M.left;
    return this;
  }

  transactions(rows: TxRow[]): this {
    const d = this.doc;
    this.doc.addPage();
    this.sectionTitle(`Transações (${rows.length})`);

    const cols = [
      { key: "date", label: "Data", w: 58, align: "left" as const },
      { key: "description", label: "Descrição", w: CONTENT_W - 58 - 96 - 88 - 68, align: "left" as const },
      { key: "category", label: "Categoria", w: 96, align: "left" as const },
      { key: "amount", label: "Valor", w: 88, align: "right" as const },
      { key: "status", label: "Status", w: 68, align: "left" as const },
    ];

    const drawHeader = () => {
      const y = d.y;
      d.rect(M.left, y, CONTENT_W, 18).fillColor(BRAND.accent).fill();
      d.font(this.f("SB")).fontSize(7.5).fillColor(BRAND.headText);
      let x = M.left;
      for (const c of cols) {
        d.text(c.label.toUpperCase(), x + 5, y + 5, { width: c.w - 10, align: c.align, lineBreak: false });
        x += c.w;
      }
      d.y = y + 18;
    };

    drawHeader();
    let zebra = false;
    for (const t of rows) {
      d.font(this.f("R")).fontSize(8);
      const descH = d.heightOfString(t.description, { width: cols[1]!.w - 10 });
      const rowH = Math.max(16, descH + 8);
      if (d.y + rowH > A4.h - M.bottom) {
        d.addPage();
        drawHeader();
        zebra = false;
      }
      const y = d.y;
      if (zebra) {
        d.rect(M.left, y, CONTENT_W, rowH).fillColor(BRAND.zebra).fill();
      }
      zebra = !zebra;
      const cells: Record<string, { text: string; color: string }> = {
        date: { text: formatDateBR(t.date, this.ctx.tz), color: BRAND.ink },
        description: { text: t.description, color: BRAND.ink },
        category: { text: t.category, color: BRAND.muted },
        amount: {
          text: `${t.isExpense ? "-" : "+"}${formatBRL(t.amountCents)}`,
          color: t.isExpense ? BRAND.neg : BRAND.pos,
        },
        status: { text: t.status, color: BRAND.muted },
      };
      let x = M.left;
      for (const c of cols) {
        const cell = cells[c.key]!;
        d.font(this.f(c.key === "amount" ? "SB" : "R")).fontSize(8).fillColor(cell.color);
        d.text(cell.text, x + 5, y + 4, {
          width: c.w - 10,
          align: c.align,
          lineBreak: c.key === "description",
          ellipsis: c.key !== "description",
        });
        x += c.w;
      }
      d.y = y + rowH;
    }
    return this;
  }

  async build(): Promise<Buffer> {
    this.stampFooters();
    this.doc.end();
    return this.done;
  }
}
