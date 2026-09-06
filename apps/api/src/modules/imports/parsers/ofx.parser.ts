/**
 * Parser de OFX (Open Financial Exchange) — extrato de conta e fatura de cartão.
 * OFX 1.x é SGML (tags sem fechamento); OFX 2.x é XML. Este parser tolera os dois:
 * lê o valor de uma tag como "tudo até a próxima '<' ou fim de linha".
 *
 * Sem dependência externa. Função pura → fácil de testar.
 */

export interface ParsedOfxRow {
  postedDate: string; // YYYY-MM-DD
  amountCents: number; // sempre positivo
  type: "EXPENSE" | "INCOME";
  description: string;
  fitid: string | null;
}

export interface ParsedOfx {
  kind: "BANK" | "CARD";
  rows: ParsedOfxRow[];
}

const TAG = (name: string, block: string): string | null => {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1]!.trim() : null;
};

/** OFX DTPOSTED: YYYYMMDD[HHMMSS[.XXX]][gmt] → YYYY-MM-DD */
function ofxDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^\s*(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseAmountToCents(raw: string | null): number | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function parseOfx(text: string): ParsedOfx {
  const isCard = /<CREDITCARDMSGSRSV1>|<CCSTMTTRN>|<CCSTMTRS>/i.test(text);
  const kind: ParsedOfx["kind"] = isCard ? "CARD" : "BANK";

  const rows: ParsedOfxRow[] = [];
  // Cada lançamento começa em <STMTTRN>. Vai até </STMTTRN> (OFX 2.x/XML) ou até o
  // próximo <STMTTRN> / fim da lista (OFX 1.x/SGML).
  const blocks = text
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((part) => part.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/BANKMSGSRSV1>|<\/CREDITCARDMSGSRSV1>/i)[0]!);

  for (const block of blocks) {
    const date = ofxDate(TAG("DTPOSTED", block));
    const cents = parseAmountToCents(TAG("TRNAMT", block));
    if (!date || cents === null || cents === 0) continue;

    const name = TAG("NAME", block) ?? "";
    const memo = TAG("MEMO", block) ?? "";
    const description = [name, memo].filter(Boolean).join(" — ").slice(0, 240) || "Lançamento";

    // o sinal do TRNAMT é a fonte de verdade: negativo = saída, positivo = entrada.
    rows.push({
      postedDate: date,
      amountCents: Math.abs(cents),
      type: cents > 0 ? "INCOME" : "EXPENSE",
      description,
      fitid: TAG("FITID", block),
    });
  }

  return { kind, rows };
}
