import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");

// Fonte da marca: o JPEG enviado pelo Filipe (wordmark "RT" sobre fundo preto),
// versionado em /logo — fora de /public pra não ir junto no build.
// Como o fundo já é preto, o "contain" letterboxeia sem emenda visível.
const srcPath = join(here, "..", "..", "..", "logo", "favicon.jpeg");
if (!existsSync(srcPath)) {
  throw new Error(`imagem-fonte não encontrada: ${srcPath}`);
}
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const DARK = { r: 11, g: 13, b: 18, alpha: 1 };

// remove a moldura preta do JPEG pra marca "RT" ocupar o ícone inteiro,
// e devolve um quadrado com uma folga pequena e simétrica sobre preto.
const PAD = 0.08; // 8% de respiro em cada lado
async function trimmed() {
  const mark = await sharp(readFileSync(srcPath))
    .trim({ background: "#000000", threshold: 12 })
    .toBuffer();
  const { width, height } = await sharp(mark).metadata();
  const side = Math.round(Math.max(width, height) * (1 + PAD * 2));
  return sharp({
    create: { width: side, height: side, channels: 4, background: BLACK },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
}
const base = await trimmed();

const square = (size) =>
  sharp(base).resize(size, size, { fit: "contain", background: BLACK }).png();

// maskable: a arte dentro de um quadrado escuro com folga (safe zone do Android)
async function maskable(size) {
  const inner = Math.round(size * 0.72);
  const mark = await sharp(base)
    .resize(inner, inner, { fit: "contain", background: DARK })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: DARK },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png();
}

const jobs = [
  [square(32), "favicon-32.png"],
  [square(180), "apple-touch-icon.png"],
  [square(192), "pwa-192.png"],
  [square(512), "pwa-512.png"],
  [square(512), "og-mark.png"],
  [await maskable(512), "pwa-512-maskable.png"],
];

for (const [pipe, name] of jobs) {
  await pipe.toFile(join(pub, name));
  console.log("✓", name);
}

// favicon.svg: só um wrapper que embute um JPEG 512² já contido — mantém válidas
// todas as referências a /favicon.svg mostrando a arte nova, sem inchar o bundle.
const jpg512 = await sharp(base)
  .resize(512, 512, { fit: "contain", background: BLACK })
  .jpeg({ quality: 82 })
  .toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <image width="512" height="512" href="data:image/jpeg;base64,${jpg512.toString("base64")}"/>
</svg>
`;
writeFileSync(join(pub, "favicon.svg"), svg);
console.log("✓ favicon.svg", `(${Math.round(svg.length / 1024)} KB)`);
