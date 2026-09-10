import { z } from "zod";
import { cuid, isoDate, amountCents, hexColor } from "./common.js";
import { GoalStatus } from "../enums.js";

const autoContribute = {
  autoContributeCents: amountCents.nullable().optional(),
  autoContributeDay: z.number().int().min(1).max(28).nullable().optional(),
  autoFromAccountId: cuid.nullable().optional(),
};

export const createGoalBody = z.object({
  name: z.string().trim().min(1).max(120),
  targetCents: amountCents,
  deadline: isoDate.nullable().optional(),
  icon: z.string().trim().min(1).max(8).default("🎯"),
  color: hexColor.default("#10B981"),
  ...autoContribute,
});
export type CreateGoalBody = z.infer<typeof createGoalBody>;

export const updateGoalBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  targetCents: amountCents.optional(),
  deadline: isoDate.nullable().optional(),
  icon: z.string().trim().min(1).max(8).optional(),
  color: hexColor.optional(),
  status: GoalStatus.optional(),
  ...autoContribute,
});
export type UpdateGoalBody = z.infer<typeof updateGoalBody>;

export const addContributionBody = z.object({
  amountCents,
  date: isoDate,
  note: z.string().trim().max(280).nullable().optional(),
  memberId: cuid.optional(),
});
export type AddContributionBody = z.infer<typeof addContributionBody>;
