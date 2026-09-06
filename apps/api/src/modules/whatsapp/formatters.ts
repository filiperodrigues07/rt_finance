import { formatBRL, formatDateBR, monthLabelBR } from "@rt-finance/shared";
import type { DashboardReport } from "@rt-finance/shared";

export function help(name: string): string {
  return [
    `Oi, ${name}! 👋 Aqui é o RT Finance.`,
    "",
    "A interpretação de mensagens naturais por IA chega na próxima etapa. Por enquanto, entendo:",
    "",
    "• *saldo* — saldo atual das contas",
    "• *resumo* — resumo financeiro do mês",
    "• *ajuda* — esta mensagem",
    "",
    "Em breve: _“Gastei 85 no mercado”_, _“Quanto gastamos esse mês?”_ e muito mais.",
  ].join("\n");
}

export function notAuthorized(): string {
  return "Este número não está autorizado a usar o RT Finance.";
}

export function audioUnavailable(): string {
  return "Recebi seu áudio, mas não consegui transcrever agora. Pode mandar por texto?";
}

export function fallback(text: string): string {
  return [
    `Recebi: “${text}”.`,
    "",
    "Ainda não interpreto mensagens livres — isso chega na ETAPA 5 (IA).",
    "Tente *saldo*, *resumo* ou *ajuda*.",
  ].join("\n");
}

export function monthSummary(report: DashboardReport): string {
  const lines = [
    `📊 *Resumo de ${monthLabelBR(report.range.from)}*`,
    "",
    `💰 Receitas: ${formatBRL(report.incomeCents)}`,
    `💸 Despesas: ${formatBRL(report.expenseCents)}`,
    `📈 Resultado: ${formatBRL(report.resultCents)}`,
  ];
  if (report.byCategory.length > 0) {
    lines.push("");
    for (const c of report.byCategory.slice(0, 5)) {
      lines.push(`${c.icon} ${c.name}: ${formatBRL(c.cents)}`);
    }
  }
  if (report.invoicesOpenCents > 0) {
    lines.push("", `💳 Faturas em aberto: ${formatBRL(report.invoicesOpenCents)}`);
  }
  return lines.join("\n");
}

export function balance(report: DashboardReport): string {
  return [
    `💰 *Saldo atual:* ${formatBRL(report.balanceCents)}`,
    "",
    `No mês: ${formatBRL(report.incomeCents)} de receitas, ${formatBRL(report.expenseCents)} de despesas.`,
  ].join("\n");
}

export function whoAmI(params: {
  displayName: string;
  householdName: string;
  phone: string;
}): string {
  return [
    `👤 ${params.displayName}`,
    `🏠 ${params.householdName}`,
    `📱 ${params.phone}`,
    formatDateBR(new Date().toISOString().slice(0, 10)),
  ].join("\n");
}
