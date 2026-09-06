/**
 * Utilitários de data. Regra do projeto: datas de competência são "YYYY-MM-DD" (sem hora);
 * todo cálculo de mês/vencimento é feito no fuso de negócio (default America/Sao_Paulo).
 */
import { DateTime } from "luxon";

export const APP_TZ = "America/Sao_Paulo";

export type IsoDate = string; // "YYYY-MM-DD"

export type PeriodPreset = "THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR" | "CUSTOM";

function dt(date: IsoDate | Date, tz: string): DateTime {
  const base =
    date instanceof Date
      ? DateTime.fromJSDate(date, { zone: tz })
      : DateTime.fromISO(date, { zone: tz });
  if (!base.isValid) throw new Error(`Data inválida: ${String(date)}`);
  return base;
}

/** Data de hoje no fuso informado, como "YYYY-MM-DD". */
export function todayIso(tz: string = APP_TZ): IsoDate {
  return DateTime.now().setZone(tz).toISODate()!;
}

/** Primeiro dia do mês da data informada, como "YYYY-MM-DD". */
export function firstDayOfMonth(date: IsoDate | Date, tz: string = APP_TZ): IsoDate {
  return dt(date, tz).startOf("month").toISODate()!;
}

/** Último dia do mês da data informada, como "YYYY-MM-DD". */
export function lastDayOfMonth(date: IsoDate | Date, tz: string = APP_TZ): IsoDate {
  return dt(date, tz).endOf("month").toISODate()!;
}

/** Soma (ou subtrai) meses, preservando "YYYY-MM-DD". */
export function addMonths(date: IsoDate | Date, months: number, tz: string = APP_TZ): IsoDate {
  return dt(date, tz).plus({ months }).toISODate()!;
}

/** Soma (ou subtrai) dias. */
export function addDays(date: IsoDate | Date, days: number, tz: string = APP_TZ): IsoDate {
  return dt(date, tz).plus({ days }).toISODate()!;
}

/**
 * Ajusta um "dia do mês" (1..31) para um mês específico, fazendo clamp ao último dia.
 * Ex.: dia 31 em fevereiro -> 28/29.
 */
export function clampDayToMonth(
  monthAnchor: IsoDate | Date,
  day: number,
  tz: string = APP_TZ,
): IsoDate {
  const anchor = dt(monthAnchor, tz).startOf("month");
  const maxDay = anchor.daysInMonth!;
  return anchor.set({ day: Math.min(Math.max(day, 1), maxDay) }).toISODate()!;
}

export interface InvoiceCompetence {
  /** 1º dia do mês de competência ("YYYY-MM-01"). */
  referenceMonth: IsoDate;
  closingDate: IsoDate;
  dueDate: IsoDate;
}

/**
 * Competência determinística de fatura de cartão (doc 02 §4.3).
 *
 *   dia = day(date)
 *   referenceMonth = (dia <= closingDay) ? mês(date) : mês(date)+1
 *   closingDate    = referenceMonth com dia = closingDay (clamp)
 *   dueDate        = (dueDay > closingDay ? referenceMonth : referenceMonth+1) com dia = dueDay (clamp)
 */
export function invoiceCompetence(params: {
  date: IsoDate | Date;
  closingDay: number;
  dueDay: number;
  tz?: string;
}): InvoiceCompetence {
  const tz = params.tz ?? APP_TZ;
  const d = dt(params.date, tz);
  const day = d.day;

  const refAnchor =
    day <= params.closingDay ? d.startOf("month") : d.startOf("month").plus({ months: 1 });
  const referenceMonth = refAnchor.toISODate()!;

  const closingDate = clampDayToMonth(referenceMonth, params.closingDay, tz);

  const dueAnchorIso =
    params.dueDay > params.closingDay
      ? referenceMonth
      : addMonths(referenceMonth, 1, tz);
  const dueDate = clampDayToMonth(dueAnchorIso, params.dueDay, tz);

  return { referenceMonth, closingDate, dueDate };
}

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** Resolve um preset de período (ou intervalo custom) para { from, to } inclusivos. */
export function resolvePeriod(
  preset: PeriodPreset,
  opts: { from?: IsoDate | null; to?: IsoDate | null; tz?: string; ref?: IsoDate } = {},
): DateRange {
  const tz = opts.tz ?? APP_TZ;
  const ref = opts.ref ? dt(opts.ref, tz) : DateTime.now().setZone(tz);

  switch (preset) {
    case "THIS_MONTH":
      return { from: ref.startOf("month").toISODate()!, to: ref.endOf("month").toISODate()! };
    case "LAST_MONTH": {
      const m = ref.minus({ months: 1 });
      return { from: m.startOf("month").toISODate()!, to: m.endOf("month").toISODate()! };
    }
    case "THIS_YEAR":
      return { from: ref.startOf("year").toISODate()!, to: ref.endOf("year").toISODate()! };
    case "CUSTOM": {
      if (!opts.from || !opts.to) throw new Error("Período CUSTOM exige from e to");
      return { from: dt(opts.from, tz).toISODate()!, to: dt(opts.to, tz).toISODate()! };
    }
  }
}

/** Formata "YYYY-MM-DD" como "DD/MM/YYYY". */
export function formatDateBR(date: IsoDate | Date, tz: string = APP_TZ): string {
  return dt(date, tz).toFormat("dd/LL/yyyy");
}

/** Nome do mês por extenso em pt-BR (ex.: "setembro de 2026"). */
export function monthLabelBR(date: IsoDate | Date, tz: string = APP_TZ): string {
  return dt(date, tz).setLocale("pt-BR").toFormat("LLLL 'de' yyyy");
}
