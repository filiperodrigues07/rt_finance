import { describe, it, expect } from "vitest";
import { parseOfx } from "./ofx.parser";

const BANK_OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260115120000[-3:BRT]
<TRNAMT>-52.90
<FITID>2026011500001
<NAME>SUPERMERCADO ANGELONI
<MEMO>Compra no debito
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260110
<TRNAMT>3500.00
<FITID>2026011000009
<NAME>PAGAMENTO SALARIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260112
<TRNAMT>-0.00
<FITID>zero
<NAME>ignorar valor zero
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const CARD_OFX_XML = `<?xml version="1.0"?>
<OFX>
 <CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
  <BANKTRANLIST>
   <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260201</DTPOSTED><TRNAMT>-120.00</TRNAMT><FITID>a1</FITID><NAME>IFOOD</NAME></STMTTRN>
   <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260205</DTPOSTED><TRNAMT>200.00</TRNAMT><FITID>a2</FITID><NAME>PAGAMENTO RECEBIDO</NAME></STMTTRN>
  </BANKTRANLIST>
 </CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

describe("parseOfx", () => {
  it("lê extrato SGML de conta, ignora valor zero, define tipo pelo sinal", () => {
    const out = parseOfx(BANK_OFX);
    expect(out.kind).toBe("BANK");
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({
      postedDate: "2026-01-15",
      amountCents: 5290,
      type: "EXPENSE",
      fitid: "2026011500001",
    });
    expect(out.rows[0]!.description).toContain("ANGELONI");
    expect(out.rows[1]).toMatchObject({ postedDate: "2026-01-10", amountCents: 350000, type: "INCOME" });
  });

  it("lê fatura de cartão em XML e detecta kind CARD", () => {
    const out = parseOfx(CARD_OFX_XML);
    expect(out.kind).toBe("CARD");
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ amountCents: 12000, type: "EXPENSE", fitid: "a1" });
    expect(out.rows[1]).toMatchObject({ amountCents: 20000, type: "INCOME", fitid: "a2" });
  });

  it("arquivo sem lançamentos → lista vazia", () => {
    expect(parseOfx("<OFX></OFX>").rows).toEqual([]);
  });
});
