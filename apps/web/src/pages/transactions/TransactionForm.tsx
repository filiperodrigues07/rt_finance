import { useEffect, useState } from "react";
import { toCents, todayIso, APP_TZ } from "@rt-finance/shared";
import type { CreateTransactionBody } from "@rt-finance/shared";
import {
  useAccounts,
  useCategories,
  useCreditCards,
  useTransactionMutations,
  usePayableInvoices,
  useInvoiceMutations,
} from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useHousehold } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { centsToMasked, formatBRL, monthLabel } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { FormRow } from "@/components/ui/FormRow";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import type { TransactionRow } from "@/lib/types";

type Mode = "EXPENSE" | "INCOME";
type PayKind = "account" | "card" | "invoice";

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
  const { pay } = useInvoiceMutations();

  const [type, setType] = useState<Mode>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso(APP_TZ));
  const [categoryId, setCategoryId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [payKind, setPayKind] = useState<PayKind>("account");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState<"paid" | "scheduled">("paid");
  const [dueDate, setDueDate] = useState(todayIso(APP_TZ));
  const [error, setError] = useState<string | null>(null);

  const payables = usePayableInvoices(open && !editing);

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
      setInvoiceId("");
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
      setInvoiceId("");
      setNotes("");
      setWhen("paid");
      setDueDate(todayIso(APP_TZ));
    }
  }, [open, editing, user?.memberId, seedDescription]);

  const cats = (categories.data ?? []).filter((c) => c.kind === "BOTH" || c.kind === type);
  const members = household.data?.members ?? [];
  const isInvoice = payKind === "invoice";
  const busy = create.isPending || update.isPending || pay.isPending;

  const payKindOptions: { value: PayKind; label: string }[] = [
    { value: "account", label: "Conta" },
    { value: "card", label: "Cartão" },
    ...(editing ? [] : [{ value: "invoice" as const, label: "Fatura" }]),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isInvoice) {
      if (!invoiceId) return setError("Escolha a fatura");
      if (!accountId) return setError("Escolha a conta para pagar");
      try {
        await pay.mutateAsync({ invoiceId, accountId, date });
        toast.success("Fatura paga");
        onClose();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Não foi possível pagar");
      }
      return;
    }

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
            {isInvoice ? "Pagar fatura" : "Salvar"}
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="space-y-3">
        {!isInvoice && (
          <>
            <Segmented
              full
              value={type}
              onChange={(v) => setType(v)}
              options={[
                { value: "EXPENSE", label: "Despesa" },
                { value: "INCOME", label: "Receita" },
              ]}
            />

            <FormRow>
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
            </FormRow>

            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={when === "scheduled"}
                onChange={(e) => setWhen(e.target.checked ? "scheduled" : "paid")}
                className="size-4 shrink-0 accent-[rgb(var(--accent))]"
              />
              Agendar como conta a pagar
            </label>
            {when === "scheduled" && (
              <p className="-mt-1 text-xs text-muted">
                Não entra no saldo até você marcar como paga (aba <span className="text-fg">A pagar</span>).
              </p>
            )}

            <Field label="Descrição">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Compra no mercado"
              />
            </Field>

            <FormRow>
              <Field label="Categoria">
                <CategoryPicker value={categoryId} onChange={setCategoryId} categories={cats} />
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
            </FormRow>
          </>
        )}

        <div>
          <span className="label">Meio de pagamento</span>
          <Segmented
            full
            value={payKind}
            onChange={(v) => setPayKind(v)}
            options={payKindOptions}
          />
        </div>

        {payKind === "account" && (
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Selecione a conta…</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
        {payKind === "card" && (
          <Select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
            <option value="">Selecione o cartão…</option>
            {(cards.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        )}
        {isInvoice && (
          <div className="space-y-3">
            <Field label="Fatura">
              <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">Selecione a fatura…</option>
                {(payables.data ?? []).map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.card.icon} {inv.card.name} · {monthLabel(inv.referenceMonth)} · {formatBRL(inv.totalCents)}
                  </option>
                ))}
              </Select>
            </Field>
            {payables.data && payables.data.length === 0 && (
              <p className="text-xs text-muted">Nenhuma fatura em aberto.</p>
            )}
            <FormRow>
              <Field label="Pagar com">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Selecione a conta…</option>
                  {(accounts.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data do pagamento">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </FormRow>
          </div>
        )}

        {isInvoice ? (
          error && <p className="text-xs text-negative">{error}</p>
        ) : (
          <Field label="Observações" error={error ?? undefined}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
