import { z } from "zod";
import { strongPassword } from "./common.js";

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBody>;

/** Pedido de link de redefinição. Resposta é sempre genérica (não revela se o e-mail existe). */
export const forgotPasswordBody = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBody>;

/** Redefinição efetiva via token recebido por e-mail. */
export const resetPasswordBody = z.object({
  token: z.string().min(10),
  password: strongPassword,
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;

export interface OkResponse {
  ok: true;
}

export const refreshBody = z.object({
  refreshToken: z.string().min(1).optional(), // opcional: também aceito via cookie httpOnly
});
export type RefreshBody = z.infer<typeof refreshBody>;

export interface AuthTokens {
  accessToken: string;
  /** Só retornado no corpo quando não há suporte a cookie (ex.: cliente não-browser). */
  refreshToken?: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  householdId: string;
  memberId: string;
  role: "OWNER" | "MEMBER";
  displayName: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  /** admin global: gerencia todos os households pela tela /admin */
  isSuperAdmin?: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}
