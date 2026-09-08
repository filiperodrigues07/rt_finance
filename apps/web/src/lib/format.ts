export { formatBRL, fromCents, toCents } from "@rt-finance/shared";
import { formatDateBR, monthLabelBR } from "@rt-finance/shared";

export function formatDate(iso: string | Date): string {
  const s = typeof iso === "string" ? iso.slice(0, 10) : iso.toISOString().slice(0, 10);
  return formatDateBR(s);
}

export function monthLabel(iso: string): string {
  return monthLabelBR(iso.slice(0, 10));
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 d" ou a data curta. */
export function timeAgo(iso: string | Date): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.floor((Date.now() - then.getTime()) / 1000);
  if (s < 45) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  if (s < 172_800) return "ontem";
  if (s < 604_800) return `há ${Math.round(s / 86_400)} d`;
  return formatDateBR(then.toISOString().slice(0, 10));
}

export function shortMonth(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[Number(m) - 1]}/${y!.slice(2)}`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Máscara de dinheiro para inputs (pt-BR): acumula os dígitos como centavos.
 * "" quando não há dígito. Ex.: "1" → "0,01" · "10000" → "100,00" · "123456" → "1.234,56".
 */
export function maskMoney(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${padded.slice(-2)}`;
}

/** Centavos inteiros → string já mascarada, para pré-preencher um `MoneyInput`. 0/null → "". */
export function centsToMasked(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "";
  return maskMoney(String(Math.round(Math.abs(cents))));
}
