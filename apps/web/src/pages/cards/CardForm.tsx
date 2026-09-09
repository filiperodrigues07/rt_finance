import { useEffect, useState } from "react";
import { toCents, bankById } from "@rt-finance/shared";
import { useCreditCardMutations, useHousehold } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { centsToMasked } from "@/lib/format";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { BankPicker } from "@/components/ui/BankPicker";
import type { CreditCard } from "@/lib/types";

const COLORS = ["#8B5CF6", "#3B82F6", "#EC4899", "#F97316", "#10B981", "#EF4444", "#64748B"];

export function CardForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: CreditCard | null;
}) {
  const toast = useToast();
  const { create, update } = useCreditCardMutations();
  const members = useHousehold().data?.members ?? [];
  const [f, setF] = useState({
    name: "",
    bankId: null as string | null,
    memberId: "",
    last4: "",
    limit: "",
    usedOpening: "",
    closingDay: "10",
    dueDay: "17",
    color: COLORS[0]!,
  });
  const [colorTouched, setColorTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setColorTouched(false);
    if (editing) {
      setF({
        name: editing.name,
        bankId: editing.bankId ?? null,
        memberId: editing.memberId ?? "",
        last4: editing.last4 ?? "",
        limit: centsToMasked(editing.limitCents),
        usedOpening: centsToMasked(editing.openingUsedCents),
        closingDay: String(editing.closingDay),
        dueDay: String(editing.dueDay),
        color: editing.color,
      });
    } else {
      setF({ name: "", bankId: null, memberId: "", last4: "", limit: "", usedOpening: "", closingDay: "10", dueDay: "17", color: COLORS[0]! });
    }
  }, [open, editing]);

  function pickBank(id: string | null) {
    const bank = bankById(id);
    setF((prev) => ({
      ...prev,
      bankId: id,
      // preenche cor pela marca do banco (se o usuário não mexeu na cor)
      color: !colorTouched && bank ? bank.color : prev.color,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) return setError("Informe o nome");
    const body = {
      name: f.name.trim(),
      bankId: f.bankId,
      bank: bankById(f.bankId)?.name ?? null, // mantém o texto legado (match da IA)
      memberId: f.memberId || null,
      last4: f.last4.trim() || null,
      limitCents: f.limit ? safeCents(f.limit) : 0,
      openingUsedCents: f.usedOpening ? safeCents(f.usedOpening) : 0,
      closingDay: Number(f.closingDay),
      dueDay: Number(f.dueDay),
      color: f.color,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      toast.success(editing ? "Cartão atualizado" : "Cartão criado");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  function safeCents(v: string) {
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
      title={editing ? "Editar cartão" : "Novo cartão"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="card-form" type="submit" loading={create.isPending || update.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="card-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nubank" autoFocus />
          </Field>
          <Field label="Dono">
            <Select value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })}>
              <option value="">Compartilhado</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.displayName}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Banco">
          <BankPicker value={f.bankId} onChange={pickBank} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Final (4 díg.)">
            <Input value={f.last4} maxLength={4} onChange={(e) => setF({ ...f, last4: e.target.value.replace(/\D/g, "") })} placeholder="1234" />
          </Field>
          <Field label="Fecha dia">
            <Input type="number" min={1} max={31} value={f.closingDay} onChange={(e) => setF({ ...f, closingDay: e.target.value })} />
          </Field>
          <Field label="Vence dia">
            <Input type="number" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Limite (R$)" error={error ?? undefined}>
            <MoneyInput value={f.limit} onChange={(v) => setF({ ...f, limit: v })} placeholder="5.000,00" />
          </Field>
          <Field label="Limite já utilizado (R$)" hint="dívida atual fora dos lançamentos">
            <MoneyInput value={f.usedOpening} onChange={(v) => setF({ ...f, usedOpening: v })} placeholder="0,00" />
          </Field>
        </div>
        <div>
          <span className="label">Cor</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColorTouched(true);
                  setF({ ...f, color: c });
                }}
                className={`size-7 rounded-full ${f.color === c ? "ring-2 ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: c, boxShadow: f.color === c ? `0 0 0 2px ${c}` : undefined }}
              />
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
