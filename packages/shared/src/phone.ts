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
 * Diz se dá para entender o que foi digitado como um celular brasileiro. Aceita
 * "(49) 99964-8444", "49 9964-8444", "5549999648444", "+55 49 99964-8444"…
 */
export function isValidPhoneBR(input: string): boolean {
  return canonical(input) !== null;
}

/** Formata para exibição/digitação: "(49) 99964-8444". Devolve o que veio se não entender. */
export function formatPhoneBR(input: string): string {
  const c = canonical(input);
  if (!c) return input;
  return `(${c.ddd}) 9${c.local8.slice(0, 4)}-${c.local8.slice(4)}`;
}

/**
 * Máscara progressiva para input (pt-BR), aplicada a cada tecla:
 * "" → "" · "49" → "(49" · "499996" → "(49) 9999" · "4999648444" → "(49) 99964-8444".
 */
export function maskPhoneBR(raw: string): string {
  const d = digits(raw).replace(/^55(?=\d{10,})/, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const local = d.slice(2);
  if (local.length <= 5) return `(${d.slice(0, 2)}) ${local}`;
  return `(${d.slice(0, 2)}) ${local.slice(0, 5)}-${local.slice(5)}`;
}

/**
 * Formas plausíveis de E.164 para um número BR — com/sem o 9º dígito do celular,
 * com/sem o +55. Para casar direto contra `User.phoneE164` (indexado) sem varrer a tabela.
 */
export function phoneCandidates(input: string): string[] {
  const set = new Set<string>();
  const c = canonical(input);
  if (c) {
    set.add(`+55${c.ddd}9${c.local8}`);
    set.add(`+55${c.ddd}${c.local8}`);
    set.add(`55${c.ddd}9${c.local8}`);
    set.add(`${c.ddd}9${c.local8}`);
  }
  const d = digits(input);
  if (d) {
    set.add(`+${d}`);
    set.add(d);
    set.add(d.startsWith("55") ? `+${d}` : `+55${d}`);
  }
  return [...set].filter(Boolean);
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
