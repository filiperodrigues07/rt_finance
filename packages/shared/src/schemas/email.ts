import { z } from "zod";

/**
 * SMTP é GLOBAL (um remetente para todo o sistema) — só o super-admin edita.
 * Cada household só escolhe se quer receber o resumo semanal.
 */
export const emailSettingsBody = z.object({
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().trim().email().max(255),
  /** vazio/omitido = manter a senha já salva */
  smtpPass: z.string().max(255).optional(),
  fromName: z.string().trim().min(1).max(80),
});
export type EmailSettingsBody = z.infer<typeof emailSettingsBody>;

/** Retorno do GET (super-admin) — nunca inclui a senha. */
export interface EmailSettingsDto {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromName: string;
  /** true = há usuário+senha SMTP salvos no sistema */
  configured: boolean;
  /** true = não há config salva e o envio cai no SMTP do .env do servidor */
  usingEnvFallback: boolean;
}

export interface EmailTestResult {
  ok: boolean;
  error?: string;
}

/** Preferência de e-mail do household (só o resumo semanal, por enquanto). */
export const householdEmailPrefsBody = z.object({
  weeklyEnabled: z.boolean(),
});
export type HouseholdEmailPrefsBody = z.infer<typeof householdEmailPrefsBody>;

export interface HouseholdEmailPrefsDto {
  weeklyEnabled: boolean;
  /** true = o sistema tem SMTP configurado (global ou .env) — dá pra receber e-mail */
  emailReady: boolean;
}
