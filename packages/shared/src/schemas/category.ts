import { z } from "zod";
import { cuid, hexColor } from "./common.js";
import { CategoryKind } from "../enums.js";

export const createCategoryBody = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(8).default("📦"),
  color: hexColor.default("#94A3B8"),
  kind: CategoryKind.default("EXPENSE"),
  parentId: cuid.nullable().optional(),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

export const updateCategoryBody = createCategoryBody.partial();
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;

export const listCategoriesQuery = z.object({
  kind: CategoryKind.optional(),
  includeArchived: z.coerce.boolean().default(false),
});
