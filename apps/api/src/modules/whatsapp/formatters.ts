import { formatBRL, formatDateBR, monthLabelBR } from "@rt-finance/shared";
import type { DashboardReport } from "@rt-finance/shared";

export function help(name: string): string {
  return [
    `Oi, ${name}! 👋 Sou o assistente do RT Finance. Pode falar comigo em linguagem natural — por texto ou áudio.`,
    "",
    "*Registrar:*",
    "• _Gastei 85 no mercado_",
    "• _Paguei 120 de luz no débito_",
    "• _Recebi 3200 de salário_",
    "• _Parcelei a geladeira em 10x no Nubank_",
    "• _Aluguel de 1500 todo dia 5_",
    "",
    "*Consultar:*",
    "• _Quanto gastamos esse mês?_",
    "• _Quanto a gente gastou com mercado?_",
    "• _Qual o saldo da conta corrente?_",
    "• _Quanto tá a fatura do Nubank?_",
    "",
    "Atalhos: *saldo*, *resumo*, *ajuda*.",
  ].join("\n");
}

export function notAuthorized(): string {
  return "Este número não está autorizado a usar o RT Finance.";
}

/** Áudio: mensagem por tipo de falha. */
export function audioProblem(reason: "disabled" | "too_large" | "bad_format" | "transient"): string {
  switch (reason) {
    case "disabled":
      return "Não consigo processar áudio aqui. Manda por texto, por favor.";
    case "too_large":
      return "Esse áudio é muito longo. Manda um mais curto (até ~1 min) ou escreve por texto.";
    case "bad_format":
      return "Não consegui entender esse áudio. Tenta gravar de novo ou manda por texto.";
    default:
      return "Recebi seu áudio, mas não consegui transcrever agora. Pode tentar de novo ou mandar por texto?";
  }
}

/** @deprecated use audioProblem() */
export function audioUnavailable(): string {
  return audioProblem("transient");
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
