import { useEffect, useState } from "react";
import { Plus, Pencil, Power, RefreshCw, Repeat } from "lucide-react";
import { toCents, todayIso, APP_TZ } from "@rt-finance/shared";
import { useAccounts, useCategories, useCreditCards, useRecurring, useRecurringMutations } from "@/lib/hooks";
import { centsToMasked, formatBRL } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import type { RecurringExpense } from "@/lib/types";

const FREQ: Record<string, string> = { WEEKLY: "semanal", MONTHLY: "mensal", YEARLY: "anual" };

export function RecurrencesPage() {
  const toast = useToast();
  const { data, isLoading } = useRecurring();
  const { remove, generate } = useRecurringMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
          <RefreshCw className="size-4" /> Gerar lançamentos
        </Button>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-4" /> Nova recorrência
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
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
              <span className="grid size-10 place-items-center rounded-lg text-lg" style={{ background: `${r.category.color}22` }}>
                {r.category.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  {!r.active && <Badge>inativa</Badge>}
                </div>
                <div className="text-xs text-muted">
                  {r.amountCents != null ? formatBRL(r.amountCents) : "valor variável"} ·{" "}
                  {FREQ[r.frequency]}
                  {r.dayOfMonth ? ` · dia ${r.dayOfMonth}` : ""} · {r.member.displayName}
                  {r.occurrenceCount != null && ` · ${r._count?.runs ?? 0}/${r.occurrenceCount}`}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" title="Editar recorrência" aria-label="Editar recorrência" onClick={() => { setEditing(r); setFormOpen(true); }}>
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

function RecurrenceForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: RecurringExpense | null;
}) {
  const toast = useToast();
  const categories = useCategories();
  const accounts = useAccounts();
  const cards = useCreditCards();
  const { create, update } = useRecurringMutations();
  const [f, setF] = useState({
    name: "",
    amount: "",
    categoryId: "",
    frequency: "MONTHLY",
    dayOfMonth: "10",
    count: "",
    pay: "account",
    accountId: "",
    creditCardId: "",
    startDate: todayIso(APP_TZ),
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setF({
        name: editing.name,
        amount: editing.amountCents != null ? centsToMasked(editing.amountCents) : "",
        categoryId: editing.category.id,
        frequency: editing.frequency,
        dayOfMonth: String(editing.dayOfMonth ?? 10),
        count: editing.occurrenceCount != null ? String(editing.occurrenceCount) : "",
        pay: editing.creditCardId ? "card" : "account",
        accountId: editing.accountId ?? "",
        creditCardId: editing.creditCardId ?? "",
        startDate: editing.startDate.slice(0, 10),
      });
    } else {
      setF({ name: "", amount: "", categoryId: "", frequency: "MONTHLY", dayOfMonth: "10", count: "", pay: "account", accountId: "", creditCardId: "", startDate: todayIso(APP_TZ) });
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) return setError("Informe o nome");
    if (!f.categoryId) return setError("Escolha a categoria");
    if (f.pay === "account" && !f.accountId) return setError("Escolha a conta");
    if (f.pay === "card" && !f.creditCardId) return setError("Escolha o cartão");

    const body = {
      name: f.name.trim(),
      amountCents: f.amount ? safe(f.amount) : null,
      categoryId: f.categoryId,
      frequency: f.frequency,
      interval: 1,
      dayOfMonth: Number(f.dayOfMonth),
      occurrenceCount: f.count ? Number(f.count) : null,
      autoPost: true,
      accountId: f.pay === "account" ? f.accountId : null,
      creditCardId: f.pay === "card" ? f.creditCardId : null,
      startDate: f.startDate,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      toast.success("Recorrência salva");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }
  function safe(v: string) {
    try {
      return toCents(v);
    } catch {
      return 0;
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Editar recorrência" : "Nova recorrência"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button form="rec-form" type="submit" loading={create.isPending || update.isPending}>Salvar</Button>
        </>
      }
    >
      <form id="rec-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Aluguel, Netflix…" autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$) — vazio = variável">
            <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
          </Field>
          <Field label="Categoria">
            <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">Selecione…</option>
              {(categories.data ?? []).filter((c) => c.kind !== "INCOME").map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Frequência">
            <Select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
              <option value="MONTHLY">Mensal</option>
              <option value="WEEKLY">Semanal</option>
              <option value="YEARLY">Anual</option>
            </Select>
          </Field>
          <Field label="Dia">
            <Input type="number" min={1} max={31} value={f.dayOfMonth} onChange={(e) => setF({ ...f, dayOfMonth: e.target.value })} />
          </Field>
          <Field label="Início">
            <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Nº de lançamentos" hint="vazio = sem fim; ex.: financiamento 12x">
          <Input
            type="number"
            min={1}
            max={360}
            placeholder="sem fim"
            value={f.count}
            onChange={(e) => setF({ ...f, count: e.target.value })}
          />
        </Field>
        <div>
          <span className="label">Meio de pagamento</span>
          <Segmented
            full
            value={f.pay as "account" | "card"}
            onChange={(v) => setF({ ...f, pay: v })}
            options={[
              { value: "account", label: "Conta" },
              { value: "card", label: "Cartão" },
            ]}
          />
          <div className="mt-1.5" />
          {f.pay === "account" ? (
            <Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              <option value="">Selecione…</option>
              {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          ) : (
            <Select value={f.creditCardId} onChange={(e) => setF({ ...f, creditCardId: e.target.value })}>
              <option value="">Selecione…</option>
              {(cards.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </Select>
          )}
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
      </form>
    </Dialog>
  );
}
