/** Vibração tátil curta em ações-chave. No-op onde não há suporte (desktop, iOS Safari). */

type Kind = "tap" | "success" | "error";

const PATTERNS: Record<Kind, number | number[]> = {
  tap: 10,
  success: [12, 40, 12],
  error: [40, 30, 40],
};

export function buzz(kind: Kind = "tap"): void {
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}
