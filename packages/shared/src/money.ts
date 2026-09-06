/**
 * Utilitários de dinheiro. Regra do projeto: valores sempre em CENTAVOS inteiros.
 * Nunca usar float para armazenar/dividir dinheiro.
 */

/** Converte um valor em reais (número ou string "1.234,56" / "1234.56") para centavos inteiros. */
export function toCents(value: number | string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Valor monetário inválido");
    return Math.round(value * 100);
  }
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/i, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // separadores de milhar
    .replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Valor monetário inválido: "${value}"`);
  return Math.round(parsed * 100);
}

/** Converte centavos inteiros para reais (número com 2 casas). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Formata centavos como "R$ 1.234,56" (pt-BR). */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(fromCents(cents));
}

/**
 * Rateia um total em N parcelas inteiras (centavos) sem perder nem sobrar centavo.
 * Regra do projeto (ADR-0009 / doc 02 §4.2): as PRIMEIRAS `r` parcelas recebem +1 centavo,
 * onde r = total - floor(total / n) * n.
 *
 * @example splitInstallments(10000, 3) => [3334, 3333, 3333]
 * @example splitInstallments(360000, 12) => [30000, ...] (12x)
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("totalCents deve ser um inteiro positivo (centavos)");
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("count deve ser um inteiro >= 1");
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Soma segura de centavos. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

/** Percentual inteiro (0..∞) de `part` sobre `total`. Retorna 0 se total <= 0. */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
