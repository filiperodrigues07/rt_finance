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
