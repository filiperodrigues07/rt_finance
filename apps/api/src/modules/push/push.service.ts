import { Inject, Injectable, Logger } from "@nestjs/common";
import webpush from "web-push";
import type { PushSubscribeBody } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";

export interface PushPayload {
  title: string;
  body: string;
  /** rota interna para abrir ao clicar (ex.: "/transacoes?comments=abc"). */
  link?: string;
  tag?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly ready: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.ready = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.ready) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    } else {
      this.logger.warn("VAPID_* não configurado — push web desligado");
    }
  }

  vapidPublicKey(): string {
    return this.ready ? this.env.VAPID_PUBLIC_KEY! : "";
  }

  async subscribe(
    householdId: string,
    userId: string,
    body: PushSubscribeBody,
  ): Promise<{ ok: true }> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { householdId, userId, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: body.userAgent ?? null },
      create: {
        householdId,
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? null,
      },
    });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ ok: true }> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }

  /**
   * Envia um push para os dispositivos do household. Se `targetUserId` for informado,
   * só para os desse usuário. Remove inscrições mortas (404/410).
   */
  async sendToHousehold(
    householdId: string,
    payload: PushPayload,
    opts: { targetUserId?: string | null } = {},
  ): Promise<void> {
    if (!this.ready) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { householdId, ...(opts.targetUserId ? { userId: opts.targetUserId } : {}) },
    });
    if (!subs.length) return;

    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      link: payload.link ?? "/",
      tag: payload.tag,
    });

    const dead: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            data,
            { TTL: 60 * 60 },
          );
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
          else this.logger.warn(`falha ao enviar push: ${(err as Error).message}`);
        }
      }),
    );
    if (dead.length) {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
    }
  }
}
