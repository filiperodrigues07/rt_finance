import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { fromCents } from "@rt-finance/shared";

export interface Slice {
  label: string;
  value: number; // centavos
  color: string;
}

const W = 900;
const H = 520;

type Theme = "dark" | "light";
interface Palette {
  bg: string;
  fg: string;
  muted: string;
  axis: string;
  bar: string;
}
const THEMES: Record<Theme, Palette> = {
  dark: { bg: "#0B0F1A", fg: "#EDF0F5", muted: "#94A3B8", axis: "#232B3D", bar: "#3B82F6" },
  light: { bg: "#FFFFFF", fg: "#0A0C10", muted: "#64748B", axis: "#E2E8F0", bar: "#1560E8" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function brl(cents: number): string {
  return fromCents(cents).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

@Injectable()
export class ChartRendererService {
  private async toPng(svg: string): Promise<Buffer> {
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  /** Donut de composição (ex.: gastos por categoria). */
  async donut(title: string, slices: Slice[], opts: { theme?: Theme } = {}): Promise<Buffer> {
    const { bg: BG, fg: FG, muted: MUTED } = THEMES[opts.theme ?? "dark"];
    const data = slices.filter((s) => s.value > 0).slice(0, 8);
    const total = data.reduce((a, s) => a + s.value, 0) || 1;
    const cx = 260;
    const cy = 280;
    const r = 150;
    const inner = 90;

    let angle = -Math.PI / 2;
    const arcs = data
      .map((s) => {
        const frac = s.value / total;
        const a0 = angle;
        const a1 = angle + frac * Math.PI * 2;
        angle = a1;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const xi0 = cx + inner * Math.cos(a1);
        const yi0 = cy + inner * Math.sin(a1);
        const xi1 = cx + inner * Math.cos(a0);
        const yi1 = cy + inner * Math.sin(a0);
        return `<path d="M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} L${xi0} ${yi0} A${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${s.color}"/>`;
      })
      .join("");

    const legend = data
      .map(
        (s, i) =>
          `<g transform="translate(500 ${140 + i * 42})">
             <rect width="16" height="16" rx="4" fill="${s.color}"/>
             <text x="26" y="13" fill="${FG}" font-size="18">${esc(s.label)}</text>
             <text x="380" y="13" fill="${MUTED}" font-size="18" text-anchor="end">${brl(s.value)}</text>
           </g>`,
      )
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="${BG}"/>
      <text x="40" y="56" fill="${FG}" font-size="28" font-weight="700" font-family="sans-serif">${esc(title)}</text>
      <text x="40" y="86" fill="${MUTED}" font-size="16" font-family="sans-serif">RT Finance</text>
      <g font-family="sans-serif">${arcs}</g>
      <text x="${cx}" y="${cy - 4}" fill="${MUTED}" font-size="14" text-anchor="middle" font-family="sans-serif">Total</text>
      <text x="${cx}" y="${cy + 22}" fill="${FG}" font-size="22" font-weight="700" text-anchor="middle" font-family="sans-serif">${brl(total)}</text>
      <g font-family="sans-serif">${legend}</g>
    </svg>`;
    return this.toPng(svg);
  }

  /** Barras verticais (ex.: evolução mensal / comprometimento futuro). */
  async bars(title: string, points: { label: string; value: number }[], opts: { theme?: Theme } = {}): Promise<Buffer> {
    const { bg: BG, fg: FG, muted: MUTED, axis: AXIS, bar: BAR } = THEMES[opts.theme ?? "dark"];
    const data = points.slice(0, 12);
    const max = Math.max(1, ...data.map((p) => p.value));
    const plotX = 70;
    const plotY = 120;
    const plotW = W - 110;
    const plotH = H - 200;
    const bw = (plotW / data.length) * 0.6;
    const gap = (plotW / data.length) * 0.4;

    const bars = data
      .map((p, i) => {
        const h = (p.value / max) * plotH;
        const x = plotX + i * (bw + gap) + gap / 2;
        const y = plotY + plotH - h;
        return `<g font-family="sans-serif">
          <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="6" fill="${BAR}"/>
          <text x="${x + bw / 2}" y="${plotY + plotH + 26}" fill="${MUTED}" font-size="14" text-anchor="middle">${esc(p.label)}</text>
          <text x="${x + bw / 2}" y="${y - 8}" fill="${FG}" font-size="13" text-anchor="middle">${brl(p.value)}</text>
        </g>`;
      })
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="${BG}"/>
      <text x="40" y="56" fill="${FG}" font-size="28" font-weight="700" font-family="sans-serif">${esc(title)}</text>
      <text x="40" y="86" fill="${MUTED}" font-size="16" font-family="sans-serif">RT Finance</text>
      <line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="${AXIS}"/>
      ${bars}
    </svg>`;
    return this.toPng(svg);
  }
}
