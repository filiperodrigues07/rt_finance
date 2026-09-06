import { z } from "zod";
import { cuid } from "./common.js";

const memberInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128),
});

export const createHouseholdBody = z.object({
  householdName: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(64).optional(),
  owner: memberInput,
  partner: memberInput.optional(),
});
export type CreateHouseholdBody = z.infer<typeof createHouseholdBody>;

export const updateAdminHouseholdBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});
export type UpdateAdminHouseholdBody = z.infer<typeof updateAdminHouseholdBody>;

export const deleteHouseholdBody = z.object({
  confirmName: z.string().trim().min(1),
});
export type DeleteHouseholdBody = z.infer<typeof deleteHouseholdBody>;

export interface AdminHouseholdRow {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  memberCount: number;
  transactionCount: number;
  whatsappInstance: string | null;
  isMine: boolean; // household do próprio super-admin
}

export interface CreateHouseholdResult {
  id: string;
  ownerEmail: string;
}

export const _adminIdParam = z.object({ id: cuid });
