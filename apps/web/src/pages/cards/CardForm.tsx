import { useEffect, useState } from "react";
import { toCents, fromCents } from "@rt-finance/shared";
import { useCreditCardMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
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
  const [f, setF] = useState({
    name: "",
    bank: "",
    last4: "",
    limit: "",
    closingDay: "10",
    dueDay: "17",
    color: COLORS[0]!,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setF({
        name: editing.name,
        bank: editing.bank ?? "",
        last4: editing.last4 ?? "",
        limit: fromCents(editing.limitCents).toString().replace(".", ","),
        closingDay: String(editing.closingDay),
        dueDay: String(editing.dueDay),
        color: editing.color,
      });
    } else {
      setF({ name: "", bank: "", last4: "", limit: "", closingDay: "10", dueDay: "17", color: COLORS[0]! });
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) return setError("Informe o nome");
    const body = {
      name: f.name.trim(),
      bank: f.bank.trim() || null,
      last4: f.last4.trim() || null,
      limitCents: f.limit ? safeCents(f.limit) : 0,
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
          <Field label="Banco">
            <Input value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} placeholder="Nu" />
          </Field>
        </div>
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
        <Field label="Limite (R$)" error={error ?? undefined}>
          <Input inputMode="decimal" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} placeholder="5.000,00" />
        </Field>
        <div>
          <span className="label">Cor</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setF({ ...f, color: c })}
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
