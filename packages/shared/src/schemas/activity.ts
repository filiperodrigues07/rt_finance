import { z } from "zod";

/** Feed de atividade: timeline mesclada de comentários + notificações do household. */
export const activityQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type ActivityQuery = z.infer<typeof activityQuery>;

export interface ActivityActor {
  displayName: string;
  color: string;
  avatarUrl: string | null;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: "comment" | "notification";
  title: string;
  body: string;
  actor?: ActivityActor;
  link?: string;
  notificationType?: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}
