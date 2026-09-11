import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { formatBRL, type ActivityActor, type ActivityItem, type ActivityPage } from "@rt-finance/shared";
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

/** Ações do dia a dia que viram item de Atividade — o resto do AuditLog fica só no banco. */
const DAY_TO_DAY: { entity: string; action: string }[] = [
  { entity: "transactions", action: "create" },
  { entity: "transactions", action: "remove" },
  { entity: "transactions", action: "pay" },
  { entity: "invoices", action: "pay" },
  { entity: "installments", action: "create" },
  { entity: "imports", action: "commit" },
];

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string, opts: { cursor?: string; limit: number }): Promise<ActivityPage> {
    const cursor = parseCursor(opts.cursor);
    const before = cursor ? new Date(cursor.at) : undefined;
    const take = opts.limit + 1;

    const [notifications, comments, auditLogs] = await Promise.all([
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
      this.prisma.auditLog.findMany({
        where: {
          householdId,
          OR: DAY_TO_DAY,
          ...(before ? { createdAt: { lte: before } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          entity: true,
          action: true,
          entityId: true,
          actorUserId: true,
          before: true,
          createdAt: true,
        },
      }),
    ]);

    const actionItems = await this.buildActionItems(householdId, auditLogs);

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
      ...actionItems,
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

  /** Transforma o AuditLog do dia a dia (lançamento, fatura, parcelamento, import) em ActivityItem. */
  private async buildActionItems(
    householdId: string,
    logs: {
      id: string;
      entity: string;
      action: string;
      entityId: string;
      actorUserId: string | null;
      before: Prisma.JsonValue | null;
      createdAt: Date;
    }[],
  ): Promise<ActivityItem[]> {
    if (!logs.length) return [];

    const is = (entity: string, action: string) => (l: (typeof logs)[number]) =>
      l.entity === entity && l.action === action;
    const idsFor = (pred: (l: (typeof logs)[number]) => boolean) =>
      [...new Set(logs.filter(pred).map((l) => l.entityId))];

    const txIds = idsFor((l) => is("transactions", "create")(l) || is("transactions", "pay")(l));
    const invIds = idsFor(is("invoices", "pay"));
    const planIds = idsFor(is("installments", "create"));
    const importIds = idsFor(is("imports", "commit"));
    const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((x): x is string => !!x))];

    const [txs, invoices, plans, imports, members] = await Promise.all([
      txIds.length
        ? this.prisma.transaction.findMany({
            where: { id: { in: txIds } },
            select: { id: true, type: true, amountCents: true, description: true },
          })
        : Promise.resolve([]),
      invIds.length
        ? this.prisma.creditCardInvoice.findMany({
            where: { id: { in: invIds } },
            select: { id: true, totalCents: true, creditCard: { select: { name: true } } },
          })
        : Promise.resolve([]),
      planIds.length
        ? this.prisma.installmentPlan.findMany({
            where: { id: { in: planIds } },
            select: { id: true, description: true, totalCents: true, installmentCount: true },
          })
        : Promise.resolve([]),
      importIds.length
        ? this.prisma.importBatch.findMany({
            where: { id: { in: importIds } },
            select: { id: true, fileName: true, committedCount: true },
          })
        : Promise.resolve([]),
      actorIds.length
        ? this.prisma.householdMember.findMany({
            where: { householdId, userId: { in: actorIds } },
            select: { userId: true, displayName: true, color: true, user: { select: { avatarUrl: true } } },
          })
        : Promise.resolve([]),
    ]);

    const txById = new Map(txs.map((t) => [t.id, t]));
    const invById = new Map(invoices.map((i) => [i.id, i]));
    const planById = new Map(plans.map((p) => [p.id, p]));
    const importById = new Map(imports.map((i) => [i.id, i]));
    const actorByUserId = new Map<string, ActivityActor>(
      members.map((m) => [m.userId, { displayName: m.displayName, color: m.color, avatarUrl: m.user.avatarUrl ?? null }]),
    );

    return logs
      .map((l): ActivityItem | null => {
        const actor = l.actorUserId ? actorByUserId.get(l.actorUserId) : undefined;
        const who = actor?.displayName ?? "Alguém";
        const base = {
          id: `a_${l.id}`,
          at: l.createdAt.toISOString(),
          kind: "action" as const,
          actor,
          actionType: `${l.entity}_${l.action}`,
        };

        if (is("transactions", "create")(l)) {
          const t = txById.get(l.entityId);
          if (!t) return null;
          return {
            ...base,
            title: `${who} lançou uma ${t.type === "INCOME" ? "receita" : "despesa"}`,
            body: `${formatBRL(t.amountCents)} — ${t.description}`,
            link: `/transacoes?comments=${t.id}`,
          };
        }
        if (is("transactions", "remove")(l)) {
          const b = l.before as { type?: string; amountCents?: number; description?: string } | null;
          return {
            ...base,
            title: `${who} excluiu um lançamento`,
            body: b?.amountCents != null ? `${formatBRL(b.amountCents)} — ${b.description ?? ""}` : "",
          };
        }
        if (is("transactions", "pay")(l)) {
          const t = txById.get(l.entityId);
          if (!t) return null;
          return {
            ...base,
            title: `${who} marcou uma conta como paga`,
            body: `${formatBRL(t.amountCents)} — ${t.description}`,
            link: `/transacoes?comments=${t.id}`,
          };
        }
        if (is("invoices", "pay")(l)) {
          const inv = invById.get(l.entityId);
          if (!inv) return null;
          return {
            ...base,
            title: `${who} pagou a fatura do ${inv.creditCard.name}`,
            body: formatBRL(inv.totalCents),
            link: "/carteira?tab=cartoes",
          };
        }
        if (is("installments", "create")(l)) {
          const p = planById.get(l.entityId);
          if (!p) return null;
          return {
            ...base,
            title: `${who} parcelou uma compra`,
            body: `${p.description} — ${p.installmentCount}× de ${formatBRL(Math.round(p.totalCents / p.installmentCount))}`,
            link: "/carteira?tab=cartoes",
          };
        }
        if (is("imports", "commit")(l)) {
          const b = importById.get(l.entityId);
          if (!b) return null;
          return {
            ...base,
            title: `${who} importou um extrato`,
            body: `${b.fileName} — ${b.committedCount} lançamento(s)`,
            link: "/transacoes",
          };
        }
        return null;
      })
      .filter((x): x is ActivityItem => x !== null);
  }
}
