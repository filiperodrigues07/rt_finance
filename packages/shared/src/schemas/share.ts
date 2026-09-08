import { z } from "zod";
import { cuid, isoDate } from "./common.js";

/** Tipos de card compartilhável (imagem branded 1080×1080). */
export const shareKind = z.enum(["transaction", "month", "invoice"]);
export type ShareKind = z.infer<typeof shareKind>;

export const shareMonthQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ShareMonthQuery = z.infer<typeof shareMonthQuery>;

/** Enviar o card no WhatsApp de um membro do household. */
export const shareWhatsappBody = z.object({
  toMemberId: cuid,
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ShareWhatsappBody = z.infer<typeof shareWhatsappBody>;

export interface ShareTarget {
  id: string;
  displayName: string;
  hasPhone: boolean;
}
