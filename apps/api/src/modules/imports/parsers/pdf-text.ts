/**
 * Extrai o texto de um PDF (extrato/fatura), 100% em Node, sem worker de verdade
 * e sem canvas. Tenta o pdfjs-dist (parser moderno, aguenta PDFs de banco atuais);
 * se ele falhar, cai no pdf-parse.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */

const req = createRequire(__filename);
let pdfjs: any;

async function loadPdfjs(): Promise<any> {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // aponta o "fake worker" para o arquivo real -> roda na thread principal
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;
  }
  return pdfjs;
}

async function viaPdfjs(buffer: Buffer): Promise<string> {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const arr = lines.get(y) ?? [];
      arr.push({ x: item.transform[4], s: item.str });
      lines.set(y, arr);
    }
    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    pages.push(ordered.join("\n"));
    page.cleanup();
  }
  await doc.destroy();
  return pages.join("\n");
}

async function viaPdfParse(buffer: Buffer): Promise<string> {
  const pdfParse = req("pdf-parse/lib/pdf-parse.js") as (
    d: Buffer,
  ) => Promise<{ text: string }>;
  const { text } = await pdfParse(buffer);
  return text ?? "";
}

const WEIRD_SPACES = /[\u00a0\u2007\u202f\u2009\u200a\u2002\u2003]/g;

export async function extractPdfText(buffer: Buffer): Promise<string> {
  let raw = "";
  try {
    raw = await viaPdfjs(buffer);
  } catch {
    raw = await viaPdfParse(buffer);
  }
  return raw
    .replace(WEIRD_SPACES, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
