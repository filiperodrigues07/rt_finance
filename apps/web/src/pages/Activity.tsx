import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  MessageSquare,
  PiggyBank,
  CreditCard,
  Target,
  Mail,
  Wallet,
  ArrowLeftRight,
  Trash2,
  CheckCircle2,
  Layers,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useActivity } from "@/lib/hooks";
import { formatDate, timeAgo } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/data";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, RowSkeleton } from "@/components/ui/misc";
import type { ActivityItem } from "@rt-finance/shared";

const ACTION_ICON: Record<string, LucideIcon> = {
  transactions_create: ArrowLeftRight,
  transactions_remove: Trash2,
  transactions_pay: CheckCircle2,
  invoices_pay: CreditCard,
  installments_create: Layers,
  imports_commit: Upload,
};

function iconFor(it: ActivityItem): LucideIcon {
  if (it.kind === "action") return ACTION_ICON[it.actionType ?? ""] ?? Bell;
  const type = it.notificationType;
  if (!type) return Bell;
  if (type.startsWith("BUDGET")) return PiggyBank;
  if (type.startsWith("INVOICE")) return CreditCard;
  if (type.startsWith("GOAL")) return Target;
  if (type.includes("DIGEST") || type.includes("WEEKLY")) return Mail;
  if (type.includes("BALANCE")) return Wallet;
  return Bell;
}

/** Rótulo do dia: "Hoje" / "Ontem" / data curta. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) /
      86_400_000,
  );
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return formatDate(iso);
}

export function ActivityPage() {
  const navigate = useNavigate();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivity();

  const groups = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const out: { label: string; items: ActivityItem[] }[] = [];
    for (const it of items) {
      const label = dayLabel(it.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  }, [data]);

  const empty = !isLoading && groups.length === 0;

  return (
    <div>
      <PageHeader
        title="Atividade"
        subtitle="O que o casal andou fazendo — lançamentos, pagamentos, comentários e alertas."
      />

      {isLoading ? (
        <Card className="divide-y divide-border p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </Card>
      ) : empty ? (
        <EmptyState
          title="Nada por aqui ainda"
          description="Lançamentos, pagamentos, comentários e alertas de orçamento, fatura e metas aparecem aqui."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {g.label}
              </h2>
              <Card className="divide-y divide-border p-0">
                {g.items.map((it) => (
                  <ActivityRow key={it.id} it={it} onOpen={() => it.link && navigate(it.link)} />
                ))}
              </Card>
            </section>
          ))}

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={() => fetchNextPage()}
                loading={isFetchingNextPage}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ it, onOpen }: { it: ActivityItem; onOpen: () => void }) {
  const Icon = iconFor(it);
  return (
    <div
      onClick={it.link ? onOpen : undefined}
      className={`flex gap-3 px-4 py-3 ${it.link ? "cursor-pointer hover:bg-surface-2/50" : ""}`}
    >
      {(it.kind === "comment" || it.kind === "action") && it.actor ? (
        <Avatar
          name={it.actor.displayName}
          src={it.actor.avatarUrl}
          color={it.actor.color}
          size={32}
        />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
          {it.kind === "comment" ? (
            <MessageSquare className="size-4" />
          ) : (
            <Icon className="size-4" />
          )}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-fg">{it.title}</span>
          <span className="shrink-0 text-[11px] text-muted">{timeAgo(it.at)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted">{it.body}</p>
      </div>
    </div>
  );
}
