/** Utilitários de telefone para o WhatsApp (Evolution manda JIDs tipo "5549999648444@s.whatsapp.net"). */

/** Extrai só os dígitos de um JID/telefone. */
export function digits(input: string): string {
  return input.replace(/@.*$/, "").replace(/\D/g, "");
}

/**
 * Reduz um número brasileiro a { ddd, local8 } canônico:
 *  - remove o código do país 55 (quando presente e sobra >= 10 dígitos)
 *  - remove o 9 do celular (quando o local tem 9 dígitos e começa com 9)
 * Assim "+55 49 99964-8444", "49 9964-8444" e "5549999648444" resultam no mesmo par.
 */
function canonical(input: string): { ddd: string; local8: string } | null {
  let d = digits(input);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  const ddd = d.slice(0, 2);
  let local = d.slice(2);
  if (local.length === 9 && local.startsWith("9")) local = local.slice(1);
  if (local.length !== 8) return null;
  return { ddd, local8: local };
}

/** Normaliza para E.164 brasileiro (+55 DDD + 9 dígitos de celular). */
export function toE164BR(input: string): string {
  const c = canonical(input);
  if (c) return `+55${c.ddd}9${c.local8}`;
  const d = digits(input);
  return d.startsWith("55") ? `+${d}` : `+55${d}`;
}

/**
 * Compara dois telefones brasileiros tolerando: código do país presente ou não,
 * e o 9º dígito do celular presente ou não. Casa DDD + os 8 dígitos finais.
 */
export function phonesMatch(a: string, b: string): boolean {
  const ca = canonical(a);
  const cb = canonical(b);
  if (ca && cb) return ca.ddd === cb.ddd && ca.local8 === cb.local8;
  // fallback: sem DDD reconhecível, compara os últimos 8 dígitos
  const da = digits(a);
  const db = digits(b);
  return da.length >= 8 && db.length >= 8 && da.slice(-8) === db.slice(-8);
}
