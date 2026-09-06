/** Converte "YYYY-MM-DD" para um Date em meia-noite UTC (para colunas Prisma @db.Date). */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Converte um Date (coluna @db.Date) de volta para "YYYY-MM-DD". */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
