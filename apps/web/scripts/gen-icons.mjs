import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = readFileSync(join(pub, "favicon.svg"));

const png = (size, density = 384) =>
  sharp(svg, { density }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();

// maskable: mesma arte dentro de um quadrado escuro com folga (safe zone)
async function maskable(size) {
  const inner = Math.round(size * 0.66);
  const mark = await png(inner).toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 11, g: 13, b: 18, alpha: 1 } },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png();
}

const jobs = [
  [png(32), "favicon-32.png"],
  [png(180), "apple-touch-icon.png"],
  [png(192), "pwa-192.png"],
  [png(512, 640), "pwa-512.png"],
  [png(512, 640), "og-mark.png"],
  [await maskable(512), "pwa-512-maskable.png"],
];

for (const [pipe, name] of jobs) {
  await pipe.toFile(join(pub, name));
  console.log("✓", name);
}
