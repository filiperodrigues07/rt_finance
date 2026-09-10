import { z } from "zod";
import { cuid } from "./common.js";

export const ACCENTS = ["blue", "pink", "violet", "emerald", "amber", "rose", "slate"] as const;
export type Accent = (typeof ACCENTS)[number];

/** Preferências do usuário (por membro), sincronizadas no servidor via Setting. */
export const userPreferences = z.object({
  theme: z
    .object({
      accent: z.enum(ACCENTS).default("blue"),
      mode: z.enum(["dark", "light", "system"]).default("dark"),
      fontScale: z.number().min(0.85).max(1.2).default(1),
      density: z.enum(["cozy", "compact"]).default("cozy"),
    })
    .default({}),
  dashboard: z
    .object({
      order: z.array(z.string()).default([]),
      hidden: z.array(z.string()).default([]),
    })
    .default({}),
  defaultPeriod: z.enum(["THIS_MONTH", "LAST_MONTH", "THIS_YEAR"]).default("THIS_MONTH"),
  quickAddTemplates: z
    .array(z.object({ label: z.string().trim().min(1).max(24), text: z.string().trim().min(1).max(120) }))
    .max(12)
    .default([]),
  defaults: z
    .object({
      accountId: cuid.nullable().optional(),
      cardId: cuid.nullable().optional(),
      nickname: z.string().trim().max(40).optional(),
    })
    .default({}),
});
export type UserPreferences = z.infer<typeof userPreferences>;

/** PUT aceita um patch raso (só o que mudou) — cada bloco é opcional e parcial. */
export const updateUserPreferences = z.object({
  theme: userPreferences.shape.theme.removeDefault().partial().optional(),
  dashboard: userPreferences.shape.dashboard.removeDefault().partial().optional(),
  defaultPeriod: userPreferences.shape.defaultPeriod.optional(),
  quickAddTemplates: userPreferences.shape.quickAddTemplates.removeDefault().optional(),
  defaults: userPreferences.shape.defaults.removeDefault().partial().optional(),
});
export type UpdateUserPreferences = z.infer<typeof updateUserPreferences>;
