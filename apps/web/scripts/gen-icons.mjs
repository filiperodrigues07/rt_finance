// Gera os PNGs de favicon/PWA a partir de public/logo-mark.svg usando sharp.
//   node apps/web/scripts/gen-icons.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, "../public");
const markSvg = readFileSync(resolve(pub, "logo-mark.svg"));

// versão "maskable": mesmo desenho, mas com respiro (safe area 80%) sobre fundo cheio
const maskableSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0B0D12"/>
  <g transform="translate(96 96) scale(3.33)">
    <g fill="none" stroke-width="9">
      <path d="M24 24V72" stroke="#3B82F6"/>
      <path d="M24 24h11a12 12 0 0 1 0 24H24" stroke="#3B82F6"/>
      <path d="M34 47 49 72" stroke="#3B82F6"/>
    </g>
    <path d="M53 24h25v9h-8v39h-9V33h-8z" fill="#F5F7FA"/>
  </g>
</svg>`);

const jobs = [
  ["favicon-32.png", markSvg, 32],
  ["apple-touch-icon.png", markSvg, 180],
  ["pwa-192.png", markSvg, 192],
  ["pwa-512.png", markSvg, 512],
  ["pwa-512-maskable.png", maskableSvg, 512],
  ["og-mark.png", markSvg, 600],
];

for (const [name, svg, size] of jobs) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(resolve(pub, name));
  console.log("  +", name, `${size}x${size}`);
}
console.log("ícones gerados em apps/web/public/");
