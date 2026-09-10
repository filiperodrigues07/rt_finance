import { Injectable, Logger } from "@nestjs/common";
import type { NotificationChannel, NotificationType, Prisma } from "@prisma/client";
import type { UpdateNotificationPrefsBody } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { NotFoundError } from "../../common/errors/domain-error";
import { WhatsAppService } from "../whatsapp/whatsapp.types";
import { PushService } from "../push/push.service";

/** Rota interna para o clique da notificação push, por tipo. */
function linkForType(type: NotificationType, data: unknown): string {
  const d = (typeof data === "object" && data ? data : {}) as Record<string, unknown>;
  if (typeof d.link === "string") return d.link;
  switch (type) {
    case "TRANSACTION_COMMENT":
      return d.transactionId ? `/transacoes?comments=${d.transactionId}` : "/transacoes";
    case "INVOICE_DUE":
      return "/carteira?tab=cartoes";
    case "BUDGET_THRESHOLD":
    case "BUDGET_EXCEEDED":
      return "/carteira?tab=orcamentos";
    case "GOAL_MILESTONE":
      return "/metas";
    case "WEEKLY_SUMMARY":
      return "/relatorios";
    default:
      return "/";
  }
}

interface PushInput {
  householdId: string;
  type: NotificationType;
  title: string;
  body: string;
  channel?: NotificationChannel;
  data?: Prisma.InputJsonValue;
  /** Se informado, não cria de novo se já existir uma notificação com o mesmo dedupe. */
  dedupe?: string;
  /** Se informado, a notificação web só aparece para esse usuário (senão é do household). */
  targetUserId?: string;
  /** Não enviar WhatsApp para esse membro (ex.: o autor de um comentário). */
  excludeMemberId?: string;
}

/** Só notificações do household inteiro, ou direcionadas a mim. */
function scopeFor(householdId: string, userId?: string): Prisma.NotificationWhereInput {
  return userId
    ? { householdId, OR: [{ userId: null }, { userId }] }
    : { householdId };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly pushService: PushService,
  ) {}

  async push(input: PushInput): Promise<void> {
    if (input.dedupe) {
      const exists = await this.prisma.notification.findFirst({
        where: { householdId: input.householdId, type: input.type, data: { path: ["dedupe"], equals: input.dedupe } },
        select: { id: true },
      });
      if (exists) return;
    }

    const pref = await this.prisma.notificationPreference.findUnique({
      where: { householdId_type: { householdId: input.householdId, type: input.type } },
    });
    if (pref && !pref.enabled) return;

    const channel = input.channel ?? "BOTH";
    const data =
      input.dedupe != null
        ? { ...(typeof input.data === "object" && input.data ? input.data : {}), dedupe: input.dedupe }
        : input.data;

    const notification = await this.prisma.notification.create({
      data: {
        householdId: input.householdId,
        userId: input.targetUserId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        channel,
        status: "PENDING",
        data: data as Prisma.InputJsonValue,
      },
    });

    const wantsWhats = channel !== "WEB" && (!pref || pref.channelWhatsapp);
    if (wantsWhats) {
      await this.deliverWhatsapp(
        input.householdId,
        `${input.title}\n\n${input.body}`,
        input.excludeMemberId,
      ).catch((err) =>
        this.logger.warn(`falha ao enviar notificação no WhatsApp: ${(err as Error).message}`),
      );
    }

    const wantsWebPush = channel !== "WHATSAPP" && (!pref || pref.channelWeb);
    if (wantsWebPush) {
      await this.pushService
        .sendToHousehold(
          input.householdId,
          {
            title: input.title,
            body: input.body,
            link: linkForType(input.type, data),
            tag: input.dedupe,
          },
          { targetUserId: input.targetUserId ?? null },
        )
        .catch((err) => this.logger.warn(`falha ao enviar push web: ${(err as Error).message}`));
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  private async deliverWhatsapp(
    householdId: string,
    text: string,
    excludeMemberId?: string,
  ): Promise<void> {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      include: { user: { select: { phoneE164: true } } },
    });
    for (const m of members) {
      if (m.id === excludeMemberId) continue;
      if (m.user.phoneE164) await this.whatsapp.sendText(m.user.phoneE164, text);
    }
  }

  async list(householdId: string, opts: { status: string; limit: number }, userId?: string) {
    return this.prisma.notification.findMany({
      where: {
        ...scopeFor(householdId, userId),
        ...(opts.status !== "ALL" ? { status: opts.status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
    });
  }

  async unreadCount(householdId: string, userId?: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { ...scopeFor(householdId, userId), status: { in: ["PENDING", "SENT"] } },
    });
    return { count };
  }

  async markRead(householdId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, householdId } });
    if (!n) throw new NotFoundError("Notificação");
    return this.prisma.notification.update({ where: { id }, data: { status: "READ" } });
  }

  async markAllRead(householdId: string, userId?: string) {
    await this.prisma.notification.updateMany({
      where: { ...scopeFor(householdId, userId), status: { in: ["PENDING", "SENT"] } },
      data: { status: "READ" },
    });
    return { ok: true };
  }

  async dismiss(householdId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, householdId } });
    if (!n) throw new NotFoundError("Notificação");
    return this.prisma.notification.update({ where: { id }, data: { status: "DISMISSED" } });
  }

  async getPrefs(householdId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { householdId },
      orderBy: { type: "asc" },
    });
  }

  async updatePrefs(householdId: string, body: UpdateNotificationPrefsBody) {
    for (const p of body.prefs) {
      await this.prisma.notificationPreference.upsert({
        where: { householdId_type: { householdId, type: p.type } },
        create: {
          householdId,
          type: p.type,
          enabled: p.enabled ?? true,
          channelWeb: p.channelWeb ?? true,
          channelWhatsapp: p.channelWhatsapp ?? true,
          thresholdPercent: p.thresholdPercent ?? null,
          leadDays: p.leadDays ?? null,
        },
        update: {
          enabled: p.enabled,
          channelWeb: p.channelWeb,
          channelWhatsapp: p.channelWhatsapp,
          thresholdPercent: p.thresholdPercent,
          leadDays: p.leadDays,
        },
      });
    }
    return this.getPrefs(householdId);
  }
}
