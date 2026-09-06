import { formatBRL, formatDateBR, splitInstallments } from "@rt-finance/shared";

export function expenseRegistered(p: {
  type: "EXPENSE" | "INCOME";
  amountCents: number;
  categoryLabel: string;
  dateIso: string;
  payLabel: string;
  memberLabel: string;
}): string {
  return [
    p.type === "EXPENSE" ? "✅ Despesa registrada!" : "✅ Receita registrada!",
    "",
    `💰 ${formatBRL(p.amountCents)}`,
    `🏷️ ${p.categoryLabel}`,
    `💳 ${p.payLabel}`,
    `👤 ${p.memberLabel}`,
    `📅 ${formatDateBR(p.dateIso)}`,
  ].join("\n");
}

export function installmentRegistered(p: {
  description: string;
  totalCents: number;
  count: number;
  cardLabel: string;
}): string {
  const parts = splitInstallments(p.totalCents, p.count);
  return [
    "✅ Compra parcelada registrada!",
    "",
    `🧾 ${p.description}`,
    `💰 Total ${formatBRL(p.totalCents)}`,
    `🔢 ${p.count}× de ${formatBRL(parts[0]!)}`,
    `💳 ${p.cardLabel}`,
  ].join("\n");
}

export function confirmExpense(p: {
  type: "EXPENSE" | "INCOME";
  amountCents: number;
  description: string;
  categoryLabel: string;
  payLabel: string;
  dateIso: string;
}): string {
  return [
    "🧾 Encontrei isso:",
    "",
    `Tipo: ${p.type === "EXPENSE" ? "Despesa" : "Receita"}`,
    `Descrição: ${p.description}`,
    `Valor: ${formatBRL(p.amountCents)}`,
    `Categoria: ${p.categoryLabel}`,
    `Pagamento: ${p.payLabel}`,
    `Data: ${formatDateBR(p.dateIso)}`,
    "",
    "Confirmar lançamento?",
    "1️⃣ Sim   2️⃣ Não   3️⃣ Editar",
  ].join("\n");
}

export function confirmInstallment(p: {
  description: string;
  totalCents: number;
  count: number;
  cardLabel: string;
  categoryLabel: string;
  firstDueLabel: string;
}): string {
  const parts = splitInstallments(p.totalCents, p.count);
  return [
    "🧾 Encontrei isso:",
    "",
    `Produto: ${p.description}`,
    `Total: ${formatBRL(p.totalCents)}`,
    `Parcelas: ${p.count}× de ${formatBRL(parts[0]!)}`,
    `Cartão: ${p.cardLabel}`,
    `Categoria: ${p.categoryLabel}`,
    `1ª parcela: ${p.firstDueLabel}`,
    "",
    "Confirmar lançamento?",
    "1️⃣ Sim   2️⃣ Não   3️⃣ Editar",
  ].join("\n");
}

export function dontUnderstand(): string {
  return [
    "Não entendi 😅",
    "",
    "Você pode dizer coisas como:",
    "• _Gastei 85 no mercado_",
    "• _Paguei 120 de luz_",
    "• _Comprei uma TV de 2.400 em 12x no Nubank_",
    "• _Quanto gastamos esse mês?_",
    "• _Quanto a Julia gastou?_",
    "",
    "Ou envie *ajuda*.",
  ].join("\n");
}
