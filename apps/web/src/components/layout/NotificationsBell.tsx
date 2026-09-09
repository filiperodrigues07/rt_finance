import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useNotifications, useUnreadCount, useNotificationMutations } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";
import type { NotificationRow } from "@/lib/types";

/** Rota de destino de uma notificação, quando dá pra deduzir do `data`. */
function linkFor(n: NotificationRow): string | null {
  const d = n.data ?? {};
  if (n.type === "TRANSACTION_COMMENT" && typeof d.transactionId === "string") {
    return `/transacoes?comments=${d.transactionId}`;
  }
  if (typeof d.budgetId === "string") return "/carteira?tab=orcamentos";
  if (typeof d.invoiceId === "string") return "/carteira?tab=cartoes";
  return null;
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: unread } = useUnreadCount();
  const { data: items } = useNotifications();
  const { read, readAll, dismiss } = useNotificationMutations();
  const count = unread?.count ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Notificações"
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-negative px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[80]">
            <div className="absolute inset-0" onClick={() => setOpen(false)} />
            <div className="animate-pop absolute right-2 top-14 flex max-h-[70vh] w-[min(94vw,380px)] flex-col rounded-2xl border border-border bg-elevated shadow-pop sm:right-4">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold">Notificações</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => readAll.mutate()}>
                    <Check className="size-4" /> Marcar lidas
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {!items || items.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="Nada por aqui" description="Alertas de fatura, orçamento e metas aparecem aqui." />
                  </div>
                ) : (
                  items.map((n) => {
                    const link = linkFor(n);
                    return (
                    <div
                      key={n.id}
                      onClick={
                        link
                          ? () => {
                              if (n.status !== "READ") read.mutate(n.id);
                              setOpen(false);
                              navigate(link);
                            }
                          : undefined
                      }
                      className={`group relative rounded-lg p-3 pl-4 text-sm transition-colors hover:bg-surface-2 ${link ? "cursor-pointer" : ""} ${
                        n.status === "READ" || n.status === "DISMISSED" ? "opacity-60" : "bg-surface-2/50"
                      }`}
                    >
                      {n.status !== "READ" && n.status !== "DISMISSED" && (
                        <span className="absolute left-1.5 top-4 size-1.5 rounded-full bg-accent" />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{n.title}</span>
                        <span className="shrink-0 text-[10px] text-muted">{formatDate(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{n.body}</p>
                      <div className="mt-1.5 flex gap-3 opacity-70 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                        {n.status !== "READ" && (
                          <button className="text-[11px] text-accent" onClick={() => read.mutate(n.id)}>
                            marcar lida
                          </button>
                        )}
                        <button className="text-[11px] text-muted" onClick={() => dismiss.mutate(n.id)}>
                          dispensar
                        </button>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
