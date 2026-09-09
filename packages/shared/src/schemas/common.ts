import { z } from "zod";
import { LIMITS } from "../constants.js";
import { isValidPhoneBR, toE164BR } from "../phone.js";

/**
 * Celular brasileiro digitado de qualquer jeito — "(49) 99964-8444", "49 9964-8444",
 * "5549999648444", "+55 49 99964-8444" — normalizado para E.164. Guardar o número em
 * formatos diferentes quebra o casamento com quem escreve para o bot, então a
 * normalização é feita aqui, uma vez, e não em cada tela.
 */
export const brPhone = z
  .string()
  .trim()
  .refine(isValidPhoneBR, "número de celular inválido — ex.: (49) 99964-8444")
  .transform(toE164BR);

export const cuid = z.string().min(1);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "esperado YYYY-MM-DD");
export const amountCents = z.number().int().min(LIMITS.minAmountCents).max(LIMITS.maxAmountCents);
export const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, "esperado #RRGGBB");

/** Política de senha do projeto: ≥8 e ao menos 1 maiúscula, 1 minúscula, 1 dígito e 1 especial. */
export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRules {
  len: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
}

/** Avalia cada regra da senha (para o checklist ao vivo no front). */
export function checkPassword(pw: string): { ok: boolean; rules: PasswordRules } {
  const rules: PasswordRules = {
    len: pw.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  return { ok: Object.values(rules).every(Boolean), rules };
}

/** Rótulos pt-BR de cada regra, na ordem de exibição. */
export const PASSWORD_RULE_LABELS: { key: keyof PasswordRules; label: string }[] = [
  { key: "len", label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres` },
  { key: "upper", label: "Uma letra maiúscula" },
  { key: "lower", label: "Uma letra minúscula" },
  { key: "digit", label: "Um número" },
  { key: "special", label: "Um caractere especial" },
];

/** Schema Zod de senha forte — usado ao DEFINIR uma senha nova (não no login). */
export const strongPassword = z
  .string()
  .max(128, "máximo de 128 caracteres")
  .refine((v) => checkPassword(v).ok, {
    message:
      "A senha precisa de ao menos 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial",
  });

export const idParam = z.object({ id: cuid });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Envelope de resposta de erro normalizado (exception filter). */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  timestamp: string;
  path?: string;
}
