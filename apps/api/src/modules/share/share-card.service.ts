import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { fromCents, monthLabelBR, formatDateBR } from "@rt-finance/shared";
import type { DashboardReport } from "@rt-finance/shared";
import { BRAND, officialLogoPng } from "../reports/pdf/brand";

const SIZE = 1080;
const PAD = 64; // borda externa até o painel branco
const INNER = 104; // conteúdo dentro do painel
const PANEL_BOTTOM = SIZE - PAD; // 1016
const FOOTER_H = 148; // faixa escura do rodapé (leva o logo oficial)
const FOOTER_Y = PANEL_BOTTOM - FOOTER_H;

/** Stack com fontes presentes tanto no Windows (dev) quanto no container Debian (prod). */
const FONT = "'DejaVu Sans','Liberation Sans','Segoe UI',Arial,sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function brl(cents: number): string {
  return fromCents(cents).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface TxCardInput {
  description: string;
  amountCents: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  date: string; // YYYY-MM-DD
  categoryName: string | null;
  categoryColor: string | null;
  memberName: string;
  sourceName: string | null; // conta ou cartão
}

export interface InvoiceCardInput {
  cardName: string;
  referenceMonth: string; // YYYY-MM-DD
  totalCents: number;
  dueDate: string; // YYYY-MM-DD
  statusLabel: string;
}

@Injectable()
export class ShareCardService {
  private async compose(svg: string): Promise<Buffer> {
    const base = sharp(Buffer.from(svg)).png();
    const logo = await officialLogoPng(560);
    if (!logo) return base.png().toBuffer();

    // encaixa o logo na altura da faixa do rodapé
    const fitted = await sharp(logo).resize({ height: 88 }).png().toBuffer();
    const meta = await sharp(fitted).metadata();
    return base
      .composite([
        {
          input: fitted,
          left: INNER,
          top: Math.round(FOOTER_Y + (FOOTER_H - (meta.height ?? 88)) / 2),
        },
      ])
      .png()
      .toBuffer();
  }

  /** Moldura comum: fundo, painel branco, kicker, título e faixa-rodapé escura (logo oficial). */
  private frame(opts: { kicker: string; title: string; footer: string; body: string }): string {
    const panel = SIZE - PAD * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" font-family="${FONT}">
      <defs>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${BRAND.accent2}"/><stop offset="1" stop-color="${BRAND.accent}"/>
        </linearGradient>
        <clipPath id="panelClip"><rect x="${PAD}" y="${PAD}" width="${panel}" height="${panel}" rx="40"/></clipPath>
      </defs>
      <rect width="${SIZE}" height="${SIZE}" fill="${BRAND.zebra}"/>
      <rect x="${PAD}" y="${PAD}" width="${panel}" height="${panel}" rx="40" fill="#FFFFFF" stroke="${BRAND.line}" stroke-width="2"/>
      <rect x="${PAD}" y="${PAD}" width="${panel}" height="10" rx="5" fill="url(#accent)"/>
      <text x="${INNER}" y="${PAD + 96}" fill="${BRAND.accent}" font-size="24" font-weight="700" letter-spacing="3">${esc(opts.kicker.toUpperCase())}</text>
      <text x="${INNER}" y="${PAD + 156}" fill="${BRAND.ink}" font-size="52" font-weight="700">${esc(opts.title)}</text>
      ${opts.body}
      <g clip-path="url(#panelClip)">
        <rect x="${PAD}" y="${FOOTER_Y}" width="${panel}" height="${FOOTER_H + 40}" fill="#000000"/>
      </g>
      <text x="${SIZE - INNER}" y="${FOOTER_Y + FOOTER_H / 2 + 8}" fill="#E7ECF3" font-size="22" text-anchor="end">${esc(opts.footer)}</text>
    </svg>`;
  }

  async renderTransaction(tx: TxCardInput, actorName: string): Promise<Buffer> {
    const signed = tx.type === "INCOME" ? tx.amountCents : -tx.amountCents;
    const valueColor = tx.type === "INCOME" ? BRAND.pos : BRAND.neg;
    const rows: { label: string; value: string }[] = [
      { label: "Data", value: formatDateBR(tx.date) },
      { label: "Categoria", value: tx.categoryName ?? "Sem categoria" },
      { label: "Responsável", value: tx.memberName },
    ];
    if (tx.sourceName) rows.push({ label: "Onde", value: tx.sourceName });

    const y0 = PAD + 300;
    const body = `
      <text x="${INNER}" y="${y0}" fill="${valueColor}" font-size="96" font-weight="700">${esc((signed < 0 ? "−" : "") + brl(Math.abs(signed)))}</text>
      <text x="${INNER}" y="${y0 + 62}" fill="${BRAND.ink}" font-size="34" font-weight="600">${esc(tx.description)}</text>
      ${rows
        .map(
          (r, i) => `
        <text x="${INNER}" y="${y0 + 150 + i * 58}" fill="${BRAND.muted}" font-size="26">${esc(r.label)}</text>
        <text x="${SIZE - INNER}" y="${y0 + 150 + i * 58}" fill="${BRAND.ink}" font-size="26" font-weight="600" text-anchor="end">${esc(r.value)}</text>`,
        )
        .join("")}
    `;
    return this.compose(
      this.frame({ kicker: "Lançamento", title: "Sobre este gasto", footer: `compartilhado por ${actorName}`, body }),
    );
  }

  async renderMonth(dash: DashboardReport, actorName: string): Promise<Buffer> {
    const title = capitalize(monthLabelBR(dash.range.from));
    const stats: { label: string; value: string; color: string }[] = [
      { label: "Receitas", value: brl(dash.incomeCents), color: BRAND.pos },
      { label: "Despesas", value: brl(dash.expenseCents), color: BRAND.neg },
      {
        label: "Resultado",
        value: (dash.resultCents < 0 ? "−" : "") + brl(Math.abs(dash.resultCents)),
        color: dash.resultCents < 0 ? BRAND.neg : BRAND.pos,
      },
    ];
    const top = dash.byCategory.filter((c) => c.cents > 0).slice(0, 3);
    const maxCat = Math.max(1, ...top.map((c) => c.cents));

    const yStats = PAD + 260;
    const statsSvg = stats
      .map(
        (s, i) => `
      <text x="${INNER}" y="${yStats + i * 78}" fill="${BRAND.muted}" font-size="28">${esc(s.label)}</text>
      <text x="${SIZE - INNER}" y="${yStats + i * 78}" fill="${s.color}" font-size="34" font-weight="700" text-anchor="end">${esc(s.value)}</text>`,
      )
      .join("");

    const yCat = yStats + stats.length * 78 + 40;
    const catSvg = top.length
      ? `<text x="${INNER}" y="${yCat}" fill="${BRAND.muted}" font-size="24" font-weight="700" letter-spacing="2">ONDE FOI</text>` +
        top
          .map((c, i) => {
            const ry = yCat + 44 + i * 66;
            const barW = Math.round((c.cents / maxCat) * (SIZE - INNER * 2));
            return `
        <text x="${INNER}" y="${ry}" fill="${BRAND.ink}" font-size="26" font-weight="600">${esc(c.name)}</text>
        <text x="${SIZE - INNER}" y="${ry}" fill="${BRAND.muted}" font-size="24" text-anchor="end">${esc(brl(c.cents))}</text>
        <rect x="${INNER}" y="${ry + 12}" width="${SIZE - INNER * 2}" height="10" rx="5" fill="${BRAND.line}"/>
        <rect x="${INNER}" y="${ry + 12}" width="${barW}" height="10" rx="5" fill="${c.color || BRAND.accent}"/>`;
          })
          .join("")
      : "";

    return this.compose(
      this.frame({
        kicker: "Resumo do mês",
        title,
        footer: `compartilhado por ${actorName}`,
        body: statsSvg + catSvg,
      }),
    );
  }

  async renderInvoice(inv: InvoiceCardInput, actorName: string): Promise<Buffer> {
    const y0 = PAD + 300;
    const body = `
      <text x="${INNER}" y="${y0}" fill="${BRAND.muted}" font-size="26">Competência · ${esc(capitalize(monthLabelBR(inv.referenceMonth)))}</text>
      <text x="${INNER}" y="${y0 + 96}" fill="${BRAND.ink}" font-size="96" font-weight="700">${esc(brl(inv.totalCents))}</text>
      <text x="${INNER}" y="${y0 + 172}" fill="${BRAND.muted}" font-size="26">Vencimento</text>
      <text x="${SIZE - INNER}" y="${y0 + 172}" fill="${BRAND.ink}" font-size="26" font-weight="600" text-anchor="end">${esc(formatDateBR(inv.dueDate))}</text>
      <text x="${INNER}" y="${y0 + 230}" fill="${BRAND.muted}" font-size="26">Situação</text>
      <text x="${SIZE - INNER}" y="${y0 + 230}" fill="${BRAND.ink}" font-size="26" font-weight="600" text-anchor="end">${esc(inv.statusLabel)}</text>
    `;
    return this.compose(
      this.frame({ kicker: "Fatura", title: inv.cardName, footer: `compartilhado por ${actorName}`, body }),
    );
  }
}
