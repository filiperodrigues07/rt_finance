import { useEffect, useRef, useState } from "react";
import { toCents, todayIso, APP_TZ } from "@rt-finance/shared";
import type { CreateTransactionBody } from "@rt-finance/shared";
import { useAccounts, useCategories, useCreditCards, useTransactionMutations } from "@/lib/hooks";
import { getPrefs } from "@/lib/preferences";
import { useAuth } from "@/lib/auth";
import { useHousehold } from "@/lib/hooks";
import { ApiError, api } from "@/lib/api";
import { centsToMasked } from "@/lib/format";
import type { ReceiptScan } from "@rt-finance/shared";
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
type PayKind = "account" | "card";

export function TransactionForm({
  open,
  onClose,
  editing,
  seedDescription,
  seedAmount,
  defaultScheduled = false,
}: {
  open: boolean;
  onClose: () => void;
  editing: TransactionRow | null;
  seedDescription?: string;
  /** valor já mascarado, ex.: "50,00" — usado pelo lançamento rápido */
  seedAmount?: string;
  /** ao abrir na aba "A pagar", já vem marcado "Agendar como conta a pagar" */
  defaultScheduled?: boolean;
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
  const [repeat, setRepeat] = useState("1");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onReceiptPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const r = await api.upload<ReceiptScan>("/transactions/scan-receipt", form);
      const got: string[] = [];
      if (r.amountCents != null) {
        setAmount(centsToMasked(r.amountCents));
        got.push("valor");
      }
      if (r.date) {
        setDate(r.date);
        setDueDate(r.date);
        got.push("data");
      }
      if (r.description && !description.trim()) {
        setDescription(r.description);
        got.push("descrição");
      }
      setError(got.length ? null : "Não consegui ler nada da foto");
    } catch {
      setError("Falha ao ler a foto");
    } finally {
      setScanning(false);
    }
  }

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
      setRepeat("1");
    } else {
      const dft = getPrefs().defaults;
      setType("EXPENSE");
      setAmount(seedAmount ?? "");
      setDescription(seedDescription ?? "");
      setDate(todayIso(APP_TZ));
      setCategoryId("");
      setMemberId(user?.memberId ?? "");
      setPayKind(dft.cardId && !dft.accountId ? "card" : "account");
      setAccountId(dft.accountId ?? "");
      setCreditCardId(dft.cardId ?? "");
      setNotes("");
      setWhen(defaultScheduled ? "scheduled" : "paid");
      setDueDate(todayIso(APP_TZ));
      setRepeat("1");
    }
  }, [open, editing, user?.memberId, seedDescription, seedAmount, defaultScheduled]);

  const cats = (categories.data ?? []).filter((c) => c.kind === "BOTH" || c.kind === type);
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
    const reps =
      scheduled && payKind === "account" ? Math.min(60, Math.max(1, Number(repeat) || 1)) : 1;
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
      repeatMonths: reps > 1 ? reps : undefined,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body });
        toast.success("Lançamento atualizado");
      } else {
        await create.mutateAsync(body);
        toast.success(reps > 1 ? `${reps} contas a pagar geradas` : "Lançamento registrado");
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
        {/* 1. Valor — o número mais importante */}
        <div>
          <div className="flex items-center justify-between">
            <span className="label">Valor</span>
            {!editing && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={scanning}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                {scanning ? "lendo…" : "📷 ler recibo"}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            capture="environment"
            className="hidden"
            onChange={onReceiptPick}
          />
          <MoneyInput
            value={amount}
            onChange={setAmount}
            autoFocus
            className="h-16 text-center text-3xl font-semibold tracking-tight"
          />
        </div>

        {/* 2. Tipo */}
        <Segmented
          full
          value={type}
          onChange={(v) => setType(v)}
          options={[
            { value: "EXPENSE", label: "Despesa" },
            { value: "INCOME", label: "Receita" },
          ]}
        />

        {/* 3. Descrição */}
        <Field label="Descrição">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Compra no mercado"
          />
        </Field>

        {/* 4. Categoria + Responsável */}
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

        {/* 5. Data */}
        <Field label={when === "scheduled" ? "Vencimento" : "Data"}>
          <Input
            type="date"
            value={when === "scheduled" ? dueDate : date}
            onChange={(e) =>
              when === "scheduled" ? setDueDate(e.target.value) : setDate(e.target.value)
            }
          />
        </Field>

        {/* 6. Meio de pagamento */}
        <div>
          <span className="label">Meio de pagamento</span>
          <Segmented
            full
            value={payKind}
            onChange={(v) => setPayKind(v)}
            options={[
              { value: "account", label: "Conta / dinheiro" },
              { value: "card", label: "Cartão de crédito" },
            ]}
          />
          <div className="mt-2">
            {payKind === "account" ? (
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Selecione a conta…</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
                <option value="">Selecione o cartão…</option>
                {(cards.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {/* 7. Agendamento */}
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
          <>
            <p className="-mt-2 text-xs text-muted">
              Não entra no saldo até você marcar como paga (aba <span className="text-fg">A pagar</span>).
            </p>
            {payKind === "account" && (
              <Field label="Parcelas (meses)" hint="1 = só esta. Ex.: 12 gera uma conta por mês em A pagar.">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </Field>
            )}
          </>
        )}

        {/* 8. Observações */}
        <Field label="Observações" error={error ?? undefined}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
      </form>
    </Dialog>
  );
}
