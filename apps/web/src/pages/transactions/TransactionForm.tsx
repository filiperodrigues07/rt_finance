import { useEffect, useState } from "react";
import { toCents, todayIso, APP_TZ } from "@rt-finance/shared";
import type { CreateTransactionBody } from "@rt-finance/shared";
import { useAccounts, useCategories, useCreditCards, useTransactionMutations } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useHousehold } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { centsToMasked } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { TransactionRow } from "@/lib/types";

type Mode = "EXPENSE" | "INCOME";
type PayKind = "account" | "card";

export function TransactionForm({
  open,
  onClose,
  editing,
  seedDescription,
}: {
  open: boolean;
  onClose: () => void;
  editing: TransactionRow | null;
  seedDescription?: string;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const categories = useCategories();
  const accounts = useAccounts();
  const cards = useCreditCards();
  const household = useHousehold();
  const { create, update } = useTransactionMutations();

  const [type, setType] = useState<Mode>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso(APP_TZ));
  const [categoryId, setCategoryId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [payKind, setPayKind] = useState<PayKind>("account");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState<"paid" | "scheduled">("paid");
  const [dueDate, setDueDate] = useState(todayIso(APP_TZ));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setType(editing.type === "INCOME" ? "INCOME" : "EXPENSE");
      setAmount(centsToMasked(editing.amountCents));
      setDescription(editing.description);
      setDate(editing.date.slice(0, 10));
      setCategoryId(editing.categoryId ?? "");
      setMemberId(editing.memberId);
      setPayKind(editing.creditCardId ? "card" : "account");
      setAccountId(editing.accountId ?? "");
      setCreditCardId(editing.creditCardId ?? "");
      setNotes(editing.notes ?? "");
      setWhen(editing.status === "PENDING" ? "scheduled" : "paid");
      setDueDate((editing.dueDate ?? editing.date).slice(0, 10));
    } else {
      setType("EXPENSE");
      setAmount("");
      setDescription(seedDescription ?? "");
      setDate(todayIso(APP_TZ));
      setCategoryId("");
      setMemberId(user?.memberId ?? "");
      setPayKind("account");
      setAccountId("");
      setCreditCardId("");
      setNotes("");
      setWhen("paid");
      setDueDate(todayIso(APP_TZ));
    }
  }, [open, editing, user?.memberId, seedDescription]);

  const cats = (categories.data ?? []).filter(
    (c) => c.kind === "BOTH" || c.kind === type,
  );
  const members = household.data?.members ?? [];
  const busy = create.isPending || update.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let amountCents: number;
    try {
      amountCents = toCents(amount);
    } catch {
      setError("Valor inválido");
      return;
    }
    if (amountCents <= 0) return setError("Informe um valor maior que zero");
    if (!description.trim()) return setError("Informe uma descrição");
    if (payKind === "account" && !accountId) return setError("Escolha a conta");
    if (payKind === "card" && !creditCardId) return setError("Escolha o cartão");

    const scheduled = when === "scheduled";
    const body: CreateTransactionBody = {
      type,
      amountCents,
      description: description.trim(),
      date,
      dueDate: scheduled ? dueDate : null,
      categoryId: categoryId || null,
      memberId: memberId || undefined,
      accountId: payKind === "account" ? accountId : null,
      creditCardId: payKind === "card" ? creditCardId : null,
      status: scheduled ? "PENDING" : "CONFIRMED",
      notes: notes.trim() || null,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body });
        toast.success("Lançamento atualizado");
      } else {
        await create.mutateAsync(body);
        toast.success("Lançamento registrado");
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Editar lançamento" : "Novo lançamento"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button form="tx-form" type="submit" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType("EXPENSE")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              type === "EXPENSE" ? "border-negative bg-negative/10 text-negative" : "border-border text-muted"
            }`}
          >
            Despesa
          </button>
          <button
            type="button"
            onClick={() => setType("INCOME")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              type === "INCOME" ? "border-positive bg-positive/10 text-positive" : "border-border text-muted"
            }`}
          >
            Receita
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setWhen("paid")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              when === "paid" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
            }`}
          >
            Já paguei
          </button>
          <button
            type="button"
            onClick={() => setWhen("scheduled")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              when === "scheduled" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
            }`}
          >
            Agendar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)">
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label={when === "scheduled" ? "Vencimento" : "Data"}>
            <Input
              type="date"
              value={when === "scheduled" ? dueDate : date}
              onChange={(e) =>
                when === "scheduled" ? setDueDate(e.target.value) : setDate(e.target.value)
              }
            />
          </Field>
        </div>
        {when === "scheduled" && (
          <p className="-mt-2 text-xs text-muted">
            Não entra no saldo até você marcar como pago (aba <span className="text-fg">A pagar</span>).
          </p>
        )}

        <Field label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Compra no mercado" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => setPayKind("account")}
              className={`rounded-md px-2.5 py-1 text-xs ${payKind === "account" ? "bg-accent/15 text-accent" : "text-muted"}`}
            >
              Conta / dinheiro
            </button>
            <button
              type="button"
              onClick={() => setPayKind("card")}
              className={`rounded-md px-2.5 py-1 text-xs ${payKind === "card" ? "bg-accent/15 text-accent" : "text-muted"}`}
            >
              Cartão de crédito
            </button>
          </div>
          {payKind === "account" ? (
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione…</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
              <option value="">Selecione…</option>
              {(cards.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <Field label="Observações" error={error ?? undefined}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
      </form>
    </Dialog>
  );
}
