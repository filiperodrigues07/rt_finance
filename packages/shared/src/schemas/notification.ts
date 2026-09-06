import { z } from "zod";
import { NotificationType, NotificationChannel } from "../enums.js";

export const listNotificationsQuery = z.object({
  status: z.enum(["PENDING", "SENT", "READ", "DISMISSED", "ALL"]).default("ALL"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const updateNotificationPrefsBody = z.object({
  prefs: z.array(
    z.object({
      type: NotificationType,
      enabled: z.boolean().optional(),
      channelWeb: z.boolean().optional(),
      channelWhatsapp: z.boolean().optional(),
      thresholdPercent: z.number().int().min(1).max(100).nullable().optional(),
      leadDays: z.number().int().min(0).max(30).nullable().optional(),
    }),
  ),
});
export type UpdateNotificationPrefsBody = z.infer<typeof updateNotificationPrefsBody>;

export interface NotificationItem {
  id: string;
  type: z.infer<typeof NotificationType>;
  title: string;
  body: string;
  channel: z.infer<typeof NotificationChannel>;
  status: "PENDING" | "SENT" | "READ" | "DISMISSED";
  createdAt: string;
  sentAt: string | null;
}
