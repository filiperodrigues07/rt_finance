import { useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useNotifications, useUnreadCount, useNotificationMutations } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data: unread } = useUnreadCount();
  const { data: items } = useNotifications();
  const { read, readAll, dismiss } = useNotificationMutations();
  const count = unread?.count ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
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
            <div className="animate-pop absolute right-2 top-14 flex max-h-[70vh] w-[min(94vw,380px)] flex-col rounded-2xl border border-border bg-surface shadow-pop sm:right-4">
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
                  items.map((n) => (
                    <div
                      key={n.id}
                      className={`group rounded-lg p-3 text-sm ${
                        n.status === "READ" || n.status === "DISMISSED" ? "opacity-60" : "bg-surface-2/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{n.title}</span>
                        <span className="shrink-0 text-[10px] text-muted">{formatDate(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{n.body}</p>
                      <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
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
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
