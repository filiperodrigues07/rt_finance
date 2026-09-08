import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

/** Paleta do relatório — derivada da marca (logo-full.svg / logo-mark.svg). */
export const BRAND = {
  accent: "#1560E8",
  accent2: "#31CCF7",
  ink: "#0A0C10",
  muted: "#64748B",
  line: "#E2E8F0",
  zebra: "#F8FAFC",
  pos: "#16A34A",
  neg: "#DC2626",
  headText: "#FFFFFF",
} as const;

/**
 * Logo horizontal do RT Finance para o PDF (fundo claro). Igual ao
 * apps/web/public/logo-full.svg, mas com "FINANCE" em cor fixa (o `currentColor`
 * não resolve no rasterizador do sharp) e sem `dominant-baseline`.
 */
const LOGO_SVG = `<svg width="560" height="180" viewBox="0 0 560 180" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lf-blue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#31CCF7"/><stop offset="1" stop-color="#1560E8"/>
    </linearGradient>
    <linearGradient id="lf-silver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C7CDD6"/><stop offset="1" stop-color="#8A93A1"/>
    </linearGradient>
    <linearGradient id="lf-bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#54D4F8"/><stop offset="1" stop-color="#1A61EA"/>
    </linearGradient>
  </defs>
  <path fill="url(#lf-blue)" fill-rule="evenodd"
    d="M12 20h84c37 0 61 21 61 53 0 22-12 39-32 47l37 70h-53l-30-61h-18v61H12V20zm50 47v35h24c13 0 21-6 21-17s-8-18-21-18H62z"/>
  <path fill="url(#lf-silver)" d="M116 20h106l-10 47h-27v113h-45V67h-34z"/>
  <g fill="url(#lf-bar)">
    <rect x="244" y="106" width="22" height="54" rx="3"/>
    <rect x="276" y="80" width="22" height="80" rx="3"/>
    <rect x="308" y="52" width="22" height="108" rx="3"/>
    <rect x="340" y="26" width="22" height="134" rx="3"/>
  </g>
  <g fill="none" stroke="#2E9BF0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="244,86 278,58 310,40 356,8"/>
    <polyline points="330,6 362,4 360,34"/>
  </g>
  <g fill="#2E9BF0">
    <circle cx="244" cy="86" r="7"/><circle cx="278" cy="58" r="7"/><circle cx="310" cy="40" r="7"/>
  </g>
  <circle cx="336" cy="120" r="34" fill="#0A0C10" stroke="#2E9BF0" stroke-width="8"/>
  <text x="336" y="138" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="42" fill="#2E9BF0">$</text>
  <text x="14" y="176" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="600" letter-spacing="18" fill="#475569">FINANCE</text>
</svg>`;

/** Rasteriza o logo como PNG transparente na largura pedida (px). Para fundos claros (PDF). */
export async function renderLogoPng(widthPx = 900): Promise<Buffer> {
  return sharp(Buffer.from(LOGO_SVG)).resize({ width: Math.round(widthPx) }).png().toBuffer();
}

/** Logo oficial (arquivo `logo/rt finance.png`, fundo preto — não alterar). */
const OFFICIAL_LOGO_CANDIDATES = [
  resolve(process.cwd(), "logo/rt finance.png"),
  resolve(process.cwd(), "../../logo/rt finance.png"),
  resolve(__dirname, "../../../../../logo/rt finance.png"),
  resolve(__dirname, "../../../../../../logo/rt finance.png"),
];
let officialLogoRaw: Buffer | null | undefined;

function loadOfficialLogo(): Buffer | null {
  if (officialLogoRaw !== undefined) return officialLogoRaw;
  const path = OFFICIAL_LOGO_CANDIDATES.find((p) => existsSync(p));
  officialLogoRaw = path ? readFileSync(path) : null;
  return officialLogoRaw;
}

/**
 * Logo OFICIAL do RT Finance, redimensionado para a largura pedida. Fundo preto
 * original preservado — usar sobre faixa escura. `null` se o arquivo não for achado.
 */
export async function officialLogoPng(widthPx = 320): Promise<Buffer | null> {
  const raw = loadOfficialLogo();
  if (!raw) return null;
  // remove só a margem preta sobrando em volta da arte (não altera o logo em si)
  return sharp(raw)
    .trim({ background: "#000000", threshold: 25 })
    .resize({ width: Math.round(widthPx) })
    .png()
    .toBuffer();
}
