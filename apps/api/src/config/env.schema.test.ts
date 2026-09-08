import { describe, it, expect } from "vitest";
import { parseEnv } from "./env.schema";

const PROD = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  JWT_ACCESS_SECRET: "x".repeat(40),
  JWT_REFRESH_SECRET: "y".repeat(40),
  AUTH_COOKIE_SECURE: "true",
  WEB_ORIGIN: "https://app.exemplo.com",
  API_PUBLIC_URL: "https://api.exemplo.com",
} as NodeJS.ProcessEnv;

describe("assertProdHardening (WhatsApp / IA)", () => {
  it("recusa produção com WHATSAPP_PROVIDER=evolution sem WHATSAPP_WEBHOOK_TOKEN", () => {
    expect(() =>
      parseEnv({
        ...PROD,
        WHATSAPP_PROVIDER: "evolution",
        EVOLUTION_BASE_URL: "http://evolution:8080",
        EVOLUTION_API_KEY: "k",
        AI_PROVIDER: "mock",
      }),
    ).toThrow(/WHATSAPP_WEBHOOK_TOKEN/);
  });

  it("recusa produção com AI_PROVIDER=nvidia sem NVIDIA_API_KEY", () => {
    expect(() =>
      parseEnv({ ...PROD, WHATSAPP_PROVIDER: "console", AI_PROVIDER: "nvidia" }),
    ).toThrow(/NVIDIA_API_KEY/);
  });

  it("passa com tudo configurado", () => {
    const env = parseEnv({
      ...PROD,
      WHATSAPP_PROVIDER: "evolution",
      EVOLUTION_BASE_URL: "http://evolution:8080",
      EVOLUTION_API_KEY: "k",
      WHATSAPP_WEBHOOK_TOKEN: "t".repeat(20),
      AI_PROVIDER: "nvidia",
      NVIDIA_API_KEY: "nv",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.WHATSAPP_HTTP_TIMEOUT_MS).toBe(12000);
  });
});
