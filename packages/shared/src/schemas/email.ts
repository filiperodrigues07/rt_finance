import { z } from "zod";

/** Config de e-mail (SMTP) por household — usada no reset de senha e nos resumos semanais. */
export const emailSettingsBody = z.object({
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().trim().email().max(255),
  /** vazio/omitido = manter a senha já salva */
  smtpPass: z.string().max(255).optional(),
  fromName: z.string().trim().min(1).max(80),
  weeklyEnabled: z.boolean(),
});
export type EmailSettingsBody = z.infer<typeof emailSettingsBody>;

/** Retorno do GET — nunca inclui a senha. */
export interface EmailSettingsDto {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromName: string;
  weeklyEnabled: boolean;
  /** true = há usuário+senha SMTP salvos neste household */
  smtpConfigured: boolean;
  /** true = não há config no household e o envio cai no SMTP do .env do servidor */
  usingEnvFallback: boolean;
}

export interface EmailTestResult {
  ok: boolean;
  error?: string;
}
