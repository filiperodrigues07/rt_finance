import { z } from "zod";
import { LIMITS } from "../constants.js";

export const cuid = z.string().min(1);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "esperado YYYY-MM-DD");
export const amountCents = z.number().int().min(LIMITS.minAmountCents).max(LIMITS.maxAmountCents);
export const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, "esperado #RRGGBB");

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
