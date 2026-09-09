import { z } from "zod";

/**
 * Backup completo dos dados financeiros de um household. As linhas são gravadas
 * "cruas" (todos os campos escalares da tabela) para o restore reinserir sem
 * remapear; anexos vão em base64. Não inclui: notificações, mensagens/conversas
 * do bot, importações, sessões, log de auditoria.
 */
const row = z.record(z.unknown());

export const backupFileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  household: z.object({ timezone: z.string() }).passthrough(),
  members: z.array(z.object({ id: z.string(), displayName: z.string() }).passthrough()),
  categories: z.array(row),
  accounts: z.array(row),
  creditCards: z.array(row),
  creditCardInvoices: z.array(row),
  installmentPlans: z.array(row),
  installments: z.array(row),
  recurringExpenses: z.array(row),
  recurringRuns: z.array(row),
  transactions: z.array(row),
  transactionComments: z.array(row),
  transactionAttachments: z.array(row),
  financialGoals: z.array(row),
  goalContributions: z.array(row),
  budgets: z.array(row),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

export interface RestoreResult {
  restored: Record<string, number>;
}

// ---------------- backup automático (agendado) ----------------

export const backupFrequency = z.enum(["off", "daily", "weekly", "monthly"]);
export type BackupFrequency = z.infer<typeof backupFrequency>;

export const backupSettingsSchema = z.object({
  frequency: backupFrequency.default("off"),
  /** anexa o .json no e-mail do(s) dono(s) */
  email: z.boolean().default(true),
  /** guarda os últimos snapshots no próprio app (baixáveis em Configurações) */
  keepInApp: z.boolean().default(true),
});
export type BackupSettingsBody = z.infer<typeof backupSettingsSchema>;

export interface HouseholdBackupPrefs extends BackupSettingsBody {
  lastRunIso: string | null;
}

export interface BackupHistoryItem {
  id: string;
  createdAt: string;
  sizeBytes: number;
  trigger: "AUTO" | "MANUAL" | string;
}
