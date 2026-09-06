/**
 * Extrai o texto de uma foto/print de extrato ou fatura (PNG/JPG) via OCR local —
 * a imagem NUNCA sai do servidor. `sharp` (já é dependência) pré-processa em
 * escala de cinza + normalização de contraste, o que ajuda bastante o OCR em foto
 * de celular. `tesseract.js` roda o reconhecimento com o pacote de idioma
 * português (baixado de um CDN na primeira vez, cacheado depois).
 */
import sharp from "sharp";
import { createWorker } from "tesseract.js";

export async function extractImageText(buffer: Buffer): Promise<string> {
  const prepped = await sharp(buffer)
    .rotate() // respeita EXIF de orientação (foto de celular)
    .grayscale()
    .normalize()
    .png()
    .toBuffer();

  const worker = await createWorker("por");
  try {
    const {
      data: { text },
    } = await worker.recognize(prepped);
    return text ?? "";
  } finally {
    await worker.terminate();
  }
}
