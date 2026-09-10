/** Extrai valor, data e descrição de um texto OCR de recibo/boleto/cupom. Best-effort. */

export interface ReceiptGuess {
  amountCents?: number;
  date?: string; // YYYY-MM-DD
  description?: string;
  isBoleto: boolean;
}

const MONEY_G = /(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/g;
const HAS_MONEY = /\d{1,3}(?:\.\d{3})*,\d{2}/;
const DATE_SLASH = /\b(\d{2})\/(\d{2})\/(\d{2,4})\b/;
const DATE_LONG = /\b(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})\b/i;
const MONTHS: Record<string, string> = {
  janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04", maio: "05",
  junho: "06", julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

const toCents = (s: string) => Math.round(parseFloat(s.replace(/\./g, "").replace(",", ".")) * 100);
const moneyIn = (l: string) => [...l.matchAll(MONEY_G)].map((m) => toCents(m[1]!));

export function parseReceipt(raw: string): ReceiptGuess {
  const text = raw.replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.trim());
  const out: ReceiptGuess = { isBoleto: /\d{5}\.?\d{5}\s+\d{5}\.?\d{6}/.test(text) };

  // valor: prioriza a linha com "total"/"valor a pagar"; senão o maior valor plausível do texto
  const priority = lines.find(
    (l) => /(valor\s*(a\s*pagar|total|cobrado)|\btotal\b)/i.test(l) && HAS_MONEY.test(l),
  );
  let amount = priority ? Math.max(...moneyIn(priority)) : undefined;
  if (amount == null) {
    const all = moneyIn(text).filter((c) => c >= 1 && c <= 5_000_000_00);
    if (all.length) amount = Math.max(...all);
  }
  if (amount != null && Number.isFinite(amount)) out.amountCents = amount;

  // data
  const ds = text.match(DATE_SLASH);
  if (ds) {
    const [, d, mo, y] = ds;
    out.date = `${y!.length === 2 ? `20${y}` : y}-${mo}-${d}`;
  } else {
    const dl = text.toLowerCase().match(DATE_LONG);
    if (dl && MONTHS[dl[2]!]) out.date = `${dl[3]}-${MONTHS[dl[2]!]}-${dl[1]!.padStart(2, "0")}`;
  }

  // descrição: 1ª linha "com cara de nome"
  const desc = lines.find(
    (l) =>
      l.length >= 4 &&
      l.length <= 60 &&
      /[a-zà-ú]{3,}/i.test(l) &&
      !HAS_MONEY.test(l) &&
      !/cnpj|cpf|data|hora|total|valor|r\$/i.test(l),
  );
  if (desc) out.description = desc.replace(/\s{2,}/g, " ");

  return out;
}
