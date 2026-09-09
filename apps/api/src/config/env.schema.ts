import { z } from "zod";

/** Validação do ambiente. Roda no boot; se faltar segredo obrigatório, o processo não sobe. */
const boolish = z
  .string()
  .transform((v) => v === "true" || v === "1")
  .pipe(z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3333"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
  APP_DEFAULT_CURRENCY: z.string().length(3).default("BRL"),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16, "defina um segredo forte"),
  JWT_REFRESH_SECRET: z.string().min(16, "defina um segredo forte"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  AUTH_COOKIE_NAME: z.string().default("rt_refresh"),
  AUTH_COOKIE_DOMAIN: z.string().default("localhost"),
  AUTH_COOKIE_SECURE: boolish.default("false"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // E-mail transacional (redefinição de senha). Sem SMTP_USER/SMTP_PASS o MailService
  // não envia nada — apenas loga o link (útil em dev/CI).
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(), // ex.: "RT Finance <no-reply@…>"; default = SMTP_USER
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(45),

  // usados a partir das ETAPAS 4-6 (opcionais por enquanto)
  // "nvidia" (real) | "mock" (regras locais, sem custo/rede — usado se faltar NVIDIA_API_KEY)
  AI_PROVIDER: z.enum(["nvidia", "mock"]).default("nvidia"),
  NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_MODEL: z.string().default("nvidia/nemotron-3-super-120b-a12b"),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  // Análise dos relatórios: o modelo "raciocina" antes de responder, então precisa
  // de mais folga de tokens e tempo que a interpretação de intenção do bot.
  AI_ANALYSIS_MAX_TOKENS: z.coerce.number().int().positive().default(3000),
  AI_ANALYSIS_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),

  // Transcrição de áudio do WhatsApp (voz → texto). Sem a chave, áudios são recusados
  // com um aviso pedindo texto. Groq expõe endpoint OpenAI-compatível de Whisper.
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  GROQ_STT_MODEL: z.string().default("whisper-large-v3"),
  WHATSAPP_PROVIDER: z.string().default("evolution"),
  EVOLUTION_BASE_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().default("rtfinance"),
  WHATSAPP_WEBHOOK_TOKEN: z.string().optional(),
  WHATSAPP_ALLOWLIST: z.string().default(""),
  // timeout de toda chamada HTTP saída para a Evolution (envio de texto/mídia, download de áudio)
  WHATSAPP_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  // teto de tamanho do áudio (bytes decodificados) antes de mandar pro Groq
  AUDIO_MAX_BYTES: z.coerce.number().int().positive().default(8_000_000),

  AI_CONFIRM_THRESHOLD_CENTS: z.coerce.number().int().nonnegative().default(50000),
  PENDING_CONFIRMATION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  RECURRING_HORIZON_MONTHS: z.coerce.number().int().positive().default(2),
  JOBS_ENABLED: boolish.default("true"),
});

export type Env = z.infer<typeof envSchema>;

/** Trava de produção: recusa subir com configuração insegura. */
function assertProdHardening(env: Env): void {
  if (env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  if (!env.AUTH_COOKIE_SECURE) problems.push("AUTH_COOKIE_SECURE deve ser true (HTTPS)");
  for (const [k, v] of [
    ["JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET],
    ["JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET],
  ] as const) {
    if (/change-me|dev-|secret-0+/i.test(v) || v.length < 32) {
      problems.push(`${k} fraco/placeholder — use ≥32 chars aleatórios`);
    }
  }
  if (env.WEB_ORIGIN.includes("localhost")) problems.push("WEB_ORIGIN aponta para localhost");

  if (env.WHATSAPP_PROVIDER === "evolution") {
    if (!env.EVOLUTION_BASE_URL) problems.push("EVOLUTION_BASE_URL obrigatório com WHATSAPP_PROVIDER=evolution");
    if (!env.EVOLUTION_API_KEY) problems.push("EVOLUTION_API_KEY obrigatório com WHATSAPP_PROVIDER=evolution");
    if (!env.WHATSAPP_WEBHOOK_TOKEN)
      problems.push("WHATSAPP_WEBHOOK_TOKEN obrigatório — sem ele o webhook rejeita TODAS as mensagens em produção");
    if (/localhost|127\.0\.0\.1/.test(env.API_PUBLIC_URL))
      problems.push("API_PUBLIC_URL aponta para localhost — o webhook da Evolution não chegaria");
  }
  if (env.AI_PROVIDER === "nvidia" && !env.NVIDIA_API_KEY) {
    problems.push("NVIDIA_API_KEY vazio com AI_PROVIDER=nvidia — o bot cairia no mock (degradado)");
  }

  if (problems.length) {
    throw new Error(`Configuração insegura para produção:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
}

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${details}`);
  }
  assertProdHardening(result.data);
  return result.data;
}

export const ENV = "ENV_CONFIG";
