import { z } from "zod";

/** Inscrição vinda do navegador (PushSubscription.toJSON()). */
export const pushSubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(400).optional(),
});
export type PushSubscribeBody = z.infer<typeof pushSubscribeBody>;

export const pushUnsubscribeBody = z.object({ endpoint: z.string().url() });
export type PushUnsubscribeBody = z.infer<typeof pushUnsubscribeBody>;

export interface PushVapidKey {
  /** chave pública VAPID em base64url; vazia quando o push web não está configurado no servidor. */
  publicKey: string;
}
