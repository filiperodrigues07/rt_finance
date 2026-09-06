import { z } from "zod";

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBody>;

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
