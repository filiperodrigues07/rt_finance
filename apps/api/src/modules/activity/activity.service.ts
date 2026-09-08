import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ActivityItem, ActivityPage } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";

interface Cursor {
  at: string;
  id: string;
}

function parseCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  const sep = raw.lastIndexOf("|");
  if (sep < 0) return null;
  const at = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!at || !id || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}

/** Deriva a rota de destino de uma notificação a partir do seu `data`. */
function linkForNotification(type: string, data: Prisma.JsonValue | null): string | undefined {
  const d = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  if (typeof d.transactionId === "string") return `/transacoes?comments=${d.transactionId}`;
  if (typeof d.budgetId === "string") return "/carteira?tab=orcamentos";
  if (typeof d.invoiceId === "string") return "/carteira?tab=cartoes";
  void type;
  return undefined;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string, opts: { cursor?: string; limit: number }): Promise<ActivityPage> {
    const cursor = parseCursor(opts.cursor);
    const before = cursor ? new Date(cursor.at) : undefined;
    const take = opts.limit + 1;

    const [notifications, comments] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          householdId,
          status: { not: "DISMISSED" },
          ...(before ? { createdAt: { lte: before } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, type: true, title: true, body: true, createdAt: true, data: true },
      }),
      this.prisma.transactionComment.findMany({
        where: {
          transaction: { householdId },
          ...(before ? { createdAt: { lte: before } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          body: true,
          createdAt: true,
          transactionId: true,
          transaction: { select: { description: true } },
          author: {
            select: { displayName: true, color: true, user: { select: { avatarUrl: true } } },
          },
        },
      }),
    ]);

    const items: ActivityItem[] = [
      ...notifications.map((n): ActivityItem => ({
        id: `n_${n.id}`,
        at: n.createdAt.toISOString(),
        kind: "notification",
        title: n.title,
        body: n.body,
        link: linkForNotification(n.type, n.data),
        notificationType: n.type,
      })),
      ...comments.map((c): ActivityItem => {
        const trecho = c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body;
        return {
          id: `c_${c.id}`,
          at: c.createdAt.toISOString(),
          kind: "comment",
          title: `${c.author.displayName} comentou`,
          body: `"${c.transaction.description}" — ${trecho}`,
          actor: {
            displayName: c.author.displayName,
            color: c.author.color,
            avatarUrl: c.author.user.avatarUrl ?? null,
          },
          link: `/transacoes?comments=${c.transactionId}`,
        };
      }),
    ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));

    const filtered = cursor
      ? items.filter((it) => it.at < cursor.at || (it.at === cursor.at && it.id < cursor.id))
      : items;

    const page = filtered.slice(0, opts.limit);
    const last = page[page.length - 1];
    const nextCursor =
      filtered.length > opts.limit && last ? `${last.at}|${last.id}` : null;

    return { items: page, nextCursor };
  }
}
