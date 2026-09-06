import { useState } from "react";
import { Plus, Target, Trophy, Trash2, Coins } from "lucide-react";
import { toCents, fromCents, percentOf, todayIso, APP_TZ } from "@rt-finance/shared";
import { useGoals, useGoalMutations } from "@/lib/hooks";
import { formatBRL, formatDate } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/data";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import type { FinancialGoal } from "@/lib/types";

export function GoalsPage() {
  const toast = useToast();
  const { data, isLoading } = useGoals();
  const { create, remove, addContribution } = useGoalMutations();
  const [createOpen, setCreateOpen] = useState(false);
  const [contribFor, setContribFor] = useState<FinancialGoal | null>(null);
  const [toDelete, setToDelete] = useState<FinancialGoal | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Metas"
        subtitle="Objetivos de reserva e projetos do casal"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Nova meta
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={<Target className="size-6" />} title="Nenhuma meta" description="Reserva, viagem, carro… defina um objetivo e acompanhe o progresso." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data!.map((g) => {
            const pct = percentOf(g.currentCents, g.targetCents);
            return (
              <Card key={g.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg text-lg" style={{ background: `${g.color}22` }}>
                      {g.status === "ACHIEVED" ? "🏆" : g.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{g.name}</div>
                      <div className="text-xs text-muted">
                        {formatBRL(g.currentCents)} de {formatBRL(g.targetCents)}
                        {g.deadline ? ` · até ${formatDate(g.deadline)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {g.status === "ACHIEVED" && <Badge color={g.color}><Trophy className="size-3" /> concluída</Badge>}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Remover meta"
                      aria-label="Remover meta"
                      onClick={() => setToDelete(g)}
                    >
                      <Trash2 className="size-4 text-negative" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>{pct}%</span>
                    <span>faltam {formatBRL(Math.max(0, g.targetCents - g.currentCents))}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: g.color }} />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-muted">
                    {g.contributions.length} aporte(s)
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setContribFor(g)}>
                    <Coins className="size-4" /> Aportar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nova meta"
        footer={<GoalCreateFooter />}
      >
        <GoalCreateForm onDone={() => setCreateOpen(false)} createMutation={create} />
      </Dialog>

      {contribFor && (
        <ContributionDialog
          goal={contribFor}
          onClose={() => setContribFor(null)}
          mutation={addContribution}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
            toast.success("Meta removida");
            setToDelete(null);
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Erro");
          }
        }}
        title="Remover meta"
        message={`Remover "${toDelete?.name}"? Os aportes registrados também somem. Não tem volta.`}
        confirmLabel="Remover"
        danger
        loading={remove.isPending}
      />
    </div>
  );

  function GoalCreateFooter() {
    return (
      <>
        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
        <Button form="goal-form" type="submit" loading={create.isPending}>Criar</Button>
      </>
    );
  }
}

function GoalCreateForm({
  onDone,
  createMutation,
}: {
  onDone: () => void;
  createMutation: { mutateAsync: (b: unknown) => Promise<unknown> };
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome");
    let targetCents = 0;
    try {
      targetCents = toCents(target);
    } catch {
      return setError("Valor alvo inválido");
    }
    try {
      await createMutation.mutateAsync({ name: name.trim(), targetCents, deadline: deadline || null });
      toast.success("Meta criada");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro");
    }
  }

  return (
    <form id="goal-form" onSubmit={submit} className="space-y-4">
      <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Viagem, Reserva…" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor alvo (R$)"><Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10.000,00" /></Field>
        <Field label="Prazo (opcional)"><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
    </form>
  );
}

function ContributionDialog({
  goal,
  onClose,
  mutation,
}: {
  goal: FinancialGoal;
  onClose: () => void;
  mutation: { mutateAsync: (v: { id: string; body: unknown }) => Promise<unknown>; isPending: boolean };
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso(APP_TZ));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let amountCents = 0;
    try {
      amountCents = toCents(amount);
    } catch {
      return setError("Valor inválido");
    }
    try {
      await mutation.mutateAsync({ id: goal.id, body: { amountCents, date, note: note || null } });
      toast.success("Aporte registrado");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Aportar em "${goal.name}"`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button form="contrib-form" type="submit" loading={mutation.isPending}>Aportar</Button>
        </>
      }
    >
      <form id="contrib-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
          Atual: {formatBRL(goal.currentCents)} / {formatBRL(goal.targetCents)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus /></Field>
          <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Nota (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {goal.contributions.length > 0 && (
          <div className="space-y-1 text-xs text-muted">
            {goal.contributions.slice(0, 4).map((c) => (
              <div key={c.id} className="flex justify-between">
                <span>{formatDate(c.date)}{c.note ? ` · ${c.note}` : ""}</span>
                <span>{formatBRL(c.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-negative">{error}</p>}
      </form>
    </Dialog>
  );
}
