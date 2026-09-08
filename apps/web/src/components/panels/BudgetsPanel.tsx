import { useState } from "react";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { firstDayOfMonth, todayIso, APP_TZ, toCents } from "@rt-finance/shared";
import { useBudgets, useBudgetMutations, useCategories } from "@/lib/hooks";
import { formatBRL, monthLabel } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { BulletBudget } from "@/components/ui/data";

function monthOptions(): string[] {
  const now = todayIso(APP_TZ);
  const out: string[] = [];
  for (let i = -2; i <= 1; i++) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() + i);
    out.push(firstDayOfMonth(d.toISOString().slice(0, 10), APP_TZ));
  }
  return out;
}

export function BudgetsPanel() {
  const toast = useToast();
  const [month, setMonth] = useState(firstDayOfMonth(todayIso(APP_TZ), APP_TZ));
  const { data: budgets, isLoading } = useBudgets(month);
  const { upsert, remove } = useBudgetMutations();
  const categories = useCategories();
  const [formOpen, setFormOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  async function runChecks() {
    setChecking(true);
    try {
      const r = (await api.post("/budgets/check")) as { alerts: number };
      toast.success(r.alerts > 0 ? `${r.alerts} alerta(s) gerado(s)` : "Tudo sob controle");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erro");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-44">
          {monthOptions().map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={runChecks} loading={checking}>
          <ShieldCheck className="size-4" /> Verificar alertas
        </Button>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="size-4" /> Definir
        </Button>
      </div>

      <Card>
        <CardHeader title="Orçamentos por categoria" description={monthLabel(month)} />
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (budgets ?? []).length === 0 ? (
          <EmptyState
            title="Nenhum orçamento"
            description="Defina um teto de gasto por categoria e receba alertas ao se aproximar."
          />
        ) : (
          <div className="space-y-4">
            {budgets!.map((b) => (
              <div key={b.id}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span>
                    {b.categoryIcon} {b.categoryName}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tnum text-muted">
                      {formatBRL(b.spentCents)} / {formatBRL(b.amountCents)}
                    </span>
                    <span
                      className={
                        b.percent > 100
                          ? "font-semibold text-negative"
                          : b.percent >= 80
                            ? "font-semibold text-warning"
                            : "text-muted"
                      }
                    >
                      {b.percent}%
                    </span>
                    <button
                      onClick={() => remove.mutate(b.id)}
                      className="text-muted transition-colors hover:text-negative"
                      aria-label="Remover"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                <BulletBudget spent={b.spentCents} budget={b.amountCents} color={b.categoryColor} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Definir orçamento"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button form="budget-form" type="submit" loading={upsert.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        <BudgetForm
          month={month}
          categories={(categories.data ?? []).filter((c) => c.kind !== "INCOME")}
          onDone={() => setFormOpen(false)}
          upsert={upsert}
        />
      </Dialog>
    </div>
  );
}

function BudgetForm({
  month,
  categories,
  onDone,
  upsert,
}: {
  month: string;
  categories: { id: string; name: string; icon: string }[];
  onDone: () => void;
  upsert: { mutateAsync: (b: unknown) => Promise<unknown>; isPending: boolean };
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return setError("Escolha a categoria");
    let amountCents = 0;
    try {
      amountCents = toCents(amount);
    } catch {
      return setError("Valor inválido");
    }
    try {
      await upsert.mutateAsync({ categoryId, month, amountCents });
      toast.success("Orçamento salvo");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro");
    }
  }

  return (
    <form id="budget-form" onSubmit={submit} className="space-y-4">
      <Field label="Categoria">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Selecione…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Limite mensal (R$)" error={error ?? undefined}>
        <MoneyInput value={amount} onChange={setAmount} placeholder="1.500,00" autoFocus />
      </Field>
    </form>
  );
}
