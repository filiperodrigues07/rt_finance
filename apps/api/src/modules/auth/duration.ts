/** Converte "15m", "30d", "12h", "45s", "2w" em segundos. */
export function durationToSeconds(input: string): number {
  const m = /^(\d+)\s*(s|m|h|d|w)$/.exec(input.trim());
  if (!m) throw new Error(`Duração inválida: "${input}"`);
  const value = Number(m[1]);
  const unit = m[2] as "s" | "m" | "h" | "d" | "w";
  const table: Record<typeof unit, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };
  return value * table[unit];
}
