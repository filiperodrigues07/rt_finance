/**
 * Bancos brasileiros mais usados. Lista estática — não vai pro banco de dados.
 * `code` = código de compensação (Febraban). `logo` = arquivo em
 * `apps/web/public/banks/<logo>` (opcional; sem logo o front mostra um chip com a
 * cor da marca + inicial).
 */
export interface Bank {
  id: string;
  name: string;
  code: string; // compensação (ex.: "260" = Nubank)
  color: string; // cor da marca (fundo do chip)
  fg?: string; // cor do texto sobre a marca (default branco)
  logo?: string; // arquivo em public/banks/
}

export const BANKS: readonly Bank[] = [
  { id: "nubank", name: "Nubank", code: "260", color: "#820AD1", logo: "nubank.png" },
  { id: "itau", name: "Itaú", code: "341", color: "#EC7000", logo: "itau.png" },
  { id: "bradesco", name: "Bradesco", code: "237", color: "#CC092F", logo: "bradesco.jpeg" },
  { id: "bb", name: "Banco do Brasil", code: "001", color: "#FAE128", fg: "#0038A8" },
  { id: "caixa", name: "Caixa", code: "104", color: "#1B62A6", logo: "caixa.svg" },
  { id: "santander", name: "Santander", code: "033", color: "#EC0000", logo: "santander.png" },
  { id: "inter", name: "Inter", code: "077", color: "#FF7A00" },
  { id: "c6", name: "C6 Bank", code: "336", color: "#242424", logo: "c6.png" },
  { id: "original", name: "Original", code: "212", color: "#00A868" },
  { id: "next", name: "Next", code: "237", color: "#00E15A", fg: "#062B14" },
  { id: "neon", name: "Neon", code: "536", color: "#00E5FF", fg: "#04202B" },
  { id: "pan", name: "Banco Pan", code: "623", color: "#00A0DF" },
  { id: "bmg", name: "BMG", code: "318", color: "#F58220" },
  { id: "safra", name: "Safra", code: "422", color: "#0A1E3C" },
  { id: "btg", name: "BTG Pactual", code: "208", color: "#0B2A4A" },
  { id: "sicoob", name: "Sicoob", code: "756", color: "#00612E", logo: "sicoob.png" },
  { id: "sicredi", name: "Sicredi", code: "748", color: "#3A7D2C", logo: "sicredi.png" },
  { id: "picpay", name: "PicPay", code: "380", color: "#21C25E" },
  { id: "mercadopago", name: "Mercado Pago", code: "323", color: "#00AEEF" },
  { id: "pagbank", name: "PagBank", code: "290", color: "#00AA55" },
  { id: "willbank", name: "Will Bank", code: "280", color: "#FFD400", fg: "#141414" },
  { id: "outro", name: "Outro / sem banco", code: "", color: "#64748B" },
] as const;

export type BankId = (typeof BANKS)[number]["id"];
export const BANK_IDS = BANKS.map((b) => b.id) as [BankId, ...BankId[]];
export const bankById = (id?: string | null): Bank | null =>
  BANKS.find((b) => b.id === id) ?? null;
