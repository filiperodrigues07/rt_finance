/** Defaults de ambiente para os testes de integração (não sobrescreve o que já vier do shell). */
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://rtfinance:rtfinance@127.0.0.1:5432/rtfinance_test?schema=public",
  JWT_ACCESS_SECRET: "test-access-secret-0000000000000000",
  JWT_REFRESH_SECRET: "test-refresh-secret-0000000000000000",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "7d",
  AUTH_COOKIE_SECURE: "false",
  LOG_LEVEL: "fatal",
  AI_PROVIDER: "mock",
  WHATSAPP_PROVIDER: "console",
  JOBS_ENABLED: "false",
  WHATSAPP_ALLOWLIST: "",
};

for (const [k, v] of Object.entries(defaults)) {
  if (!process.env[k]) process.env[k] = v;
}
