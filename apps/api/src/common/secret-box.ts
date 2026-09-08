import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cifra simétrica para segredos guardados no banco (ex.: senha SMTP).
 * AES-256-GCM com chave derivada (scrypt) do JWT_ACCESS_SECRET.
 * Formato: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 */
const PREFIX = "v1:";

function keyFrom(secret: string): Buffer {
  return scryptSync(secret, "rt-finance/secret-box", 32);
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string, secret: string): string {
  if (!payload.startsWith(PREFIX)) {
    // valor legado gravado em texto puro — devolve como está
    return payload;
  }
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  const iv = Buffer.from(ivB64!, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
