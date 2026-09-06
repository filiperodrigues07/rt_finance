import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

export interface UploadedFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  fields: Record<string, string>;
}

/**
 * Lê um upload multipart (um único arquivo + campos de texto) de uma request Fastify.
 * Requer `@fastify/multipart` registrado no bootstrap.
 */
export async function readUpload(
  req: FastifyRequest,
  opts: { maxBytes?: number } = {},
): Promise<UploadedFile> {
  const anyReq = req as unknown as {
    isMultipart?: () => boolean;
    file?: (o?: unknown) => Promise<{
      filename: string;
      mimetype: string;
      toBuffer: () => Promise<Buffer>;
      fields: Record<string, { value?: unknown }>;
    } | undefined>;
  };

  if (typeof anyReq.isMultipart === "function" && !anyReq.isMultipart()) {
    throw new BadRequestException("Envie o arquivo como multipart/form-data.");
  }
  if (typeof anyReq.file !== "function") {
    throw new BadRequestException("Upload multipart não está disponível.");
  }

  const maxBytes = opts.maxBytes ?? 15 * 1024 * 1024;
  const data = await anyReq.file({ limits: { fileSize: maxBytes, files: 1 } });
  if (!data) throw new BadRequestException("Nenhum arquivo enviado.");

  let buffer: Buffer;
  try {
    buffer = await data.toBuffer();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      throw new BadRequestException(
        `Arquivo muito grande — o limite é ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`,
      );
    }
    throw err;
  }
  if (!buffer.length) throw new BadRequestException("Arquivo vazio.");

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(data.fields ?? {})) {
    const val = (v as { value?: unknown } | undefined)?.value;
    if (typeof val === "string") fields[k] = val;
  }

  return { filename: data.filename || "arquivo", mimetype: data.mimetype || "", buffer, fields };
}
