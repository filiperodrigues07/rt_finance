import { useState } from "react";
import { Plus, Pencil, Power, RefreshCw, Repeat } from "lucide-react";
import { useRecurring, useRecurringMutations } from "@/lib/hooks";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import type { RecurringExpense } from "@/lib/types";
import { RecurrenceForm } from "./RecurrenceForm";

const FREQ: Record<string, string> = { WEEKLY: "semanal", MONTHLY: "mensal", YEARLY: "anual" };

export function RecurrencesPanel() {
  const toast = useToast();
  const { data, isLoading } = useRecurring();
  const { remove, generate } = useRecurringMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Aluguel, energia, assinaturas… as ocorrências caem em <span className="text-fg">A pagar</span>.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const r = (await generate.mutateAsync()) as { created: number };
                toast.success(`${r.created} lançamento(s) gerado(s)`);
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Erro");
              }
            }}
            loading={generate.isPending}
          >
            <RefreshCw className="size-4" /> Gerar agora
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Nova recorrência
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-6" />}
          title="Nenhuma conta fixa"
          description="Aluguel, energia, assinaturas… o RT Finance gera os lançamentos sozinho."
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data!.map((r) => (
            <Card key={r.id} className="flex items-center gap-3 p-4">
              <span
                className="grid size-10 place-items-center rounded-lg text-lg"
                style={{ background: `${r.category.color}22` }}
              >
                {r.category.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  {!r.active && <Badge>inativa</Badge>}
                  {r.autoPost && <Badge>automático</Badge>}
                </div>
                <div className="text-xs text-muted">
                  {r.amountCents != null ? formatBRL(r.amountCents) : "valor variável"} ·{" "}
                  {FREQ[r.frequency]}
                  {r.dayOfMonth ? ` · dia ${r.dayOfMonth}` : ""} · {r.member.displayName}
                  {r.occurrenceCount != null && ` · ${r._count?.runs ?? 0}/${r.occurrenceCount}`}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Editar recorrência"
                  aria-label="Editar recorrência"
                  onClick={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={r.active ? "Desativar" : "Ativar"}
                  aria-label={r.active ? "Desativar recorrência" : "Ativar recorrência"}
                  onClick={async () => {
                    try {
                      await remove.mutateAsync(r.id);
                      toast.success("Recorrência desativada");
                    } catch (e) {
                      toast.error(e instanceof ApiError ? e.message : "Erro");
                    }
                  }}
                >
                  <Power className={r.active ? "size-4 text-negative" : "size-4 text-positive"} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RecurrenceForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </div>
  );
}
