import { z } from "zod";
import { hexColor } from "./common.js";
import { MemberRole } from "../enums.js";

export const updateHouseholdBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).optional(),
  currency: z.string().trim().length(3).optional(),
});
export type UpdateHouseholdBody = z.infer<typeof updateHouseholdBody>;

export const updateMemberBody = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  color: hexColor.optional(),
  role: MemberRole.optional(),
  /** número de WhatsApp do membro — quem pode falar com o bot deste household */
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "esperado E.164, ex.: +5511999999999")
    .nullable()
    .optional(),
});
export type UpdateMemberBody = z.infer<typeof updateMemberBody>;

/** OWNER cria um novo usuário + membro no household. */
export const createMemberBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(40),
  color: hexColor.default("#7A6A55"),
  role: MemberRole.default("MEMBER"),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "esperado E.164")
    .nullable()
    .optional(),
});
export type CreateMemberBody = z.infer<typeof createMemberBody>;

const avatarDataUri = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/, "imagem inválida")
  .max(300_000, "imagem muito grande (máx ~200 KB)");

export const updateProfileBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(160).optional(),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "esperado E.164, ex.: +5511999999999")
    .nullable()
    .optional(),
  avatarColor: hexColor.optional(),
  avatarUrl: avatarDataUri.nullable().optional(),
});
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

/** Limpar dados do household — irreversível. Sempre apaga o histórico; opções ampliam o escopo. */
export const resetDataBody = z.object({
  confirm: z.literal("LIMPAR"),
  password: z.string().min(1),
  alsoAccounts: z.boolean().default(false),
  alsoCards: z.boolean().default(false),
  alsoCategories: z.boolean().default(false),
});
export type ResetDataBody = z.infer<typeof resetDataBody>;

export interface ResetDataResult {
  cleared: string[]; // rótulos do que foi apagado
}
