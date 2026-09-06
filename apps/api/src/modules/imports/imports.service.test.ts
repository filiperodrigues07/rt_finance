import { describe, it, expect } from "vitest";
import { detectFormat } from "./imports.service";
import type { UploadedFile } from "../../common/read-upload";

function file(name: string, mimetype: string, head: number[] = []): UploadedFile {
  return {
    filename: name,
    mimetype,
    buffer: Buffer.from(head.length ? head : [0]),
    fields: {},
  };
}

describe("detectFormat", () => {
  it("reconhece OFX pelo header", () => {
    expect(detectFormat(file("extrato.txt", "text/plain", [...Buffer.from("OFXHEADER:100")]))).toBe("OFX");
  });
  it("reconhece PDF pela extensão", () => {
    expect(detectFormat(file("fatura.pdf", "application/octet-stream"))).toBe("PDF");
  });
  it("reconhece PNG pelos magic bytes", () => {
    expect(detectFormat(file("foto", "application/octet-stream", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("IMG");
  });
  it("reconhece JPEG pelos magic bytes", () => {
    expect(detectFormat(file("foto", "application/octet-stream", [0xff, 0xd8, 0xff, 0xe0]))).toBe("IMG");
  });
  it("reconhece imagem pela extensão mesmo sem mimetype", () => {
    expect(detectFormat(file("fatura.jpg", ""))).toBe("IMG");
  });
  it("rejeita formato desconhecido", () => {
    expect(() => detectFormat(file("arquivo.txt", "text/plain", [...Buffer.from("qualquer coisa")]))).toThrow();
  });
});
