export { formatBRL, fromCents, toCents } from "@rt-finance/shared";
import { formatDateBR, monthLabelBR } from "@rt-finance/shared";

export function formatDate(iso: string | Date): string {
  const s = typeof iso === "string" ? iso.slice(0, 10) : iso.toISOString().slice(0, 10);
  return formatDateBR(s);
}

export function monthLabel(iso: string): string {
  return monthLabelBR(iso.slice(0, 10));
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
