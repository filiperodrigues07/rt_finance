import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Wallet, Upload } from "lucide-react";
import { toCents } from "@rt-finance/shared";
import { useAccountMutations, useAccounts, useHousehold } from "@/lib/hooks";
import { centsToMasked, formatBRL } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/Avatar";
import { BankBadge } from "@/components/ui/BankBadge";
import { BankPicker } from "@/components/ui/BankPicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ImportDialog } from "@/components/ImportDialog";
import type { Account } from "@/lib/types";

const TYPES = [
  { value: "CHECKING", label: "Conta corrente" },
  { value: "SAVINGS", label: "Poupança" },
  { value: "CASH", label: "Dinheiro" },
  { value: "WALLET", label: "Carteira digital" },
];

export function AccountsPage() {
  const toast = useToast();
  const { data, isLoading } = useAccounts();
  const { remove } = useAccountMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [toDelete, setToDelete] = useState<Account | null>(null);
  const [importFor, setImportFor] = useState<Account | null>(null);

  const total = (data ?? []).reduce((a, x) => a + x.balanceCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Saldo somado: <strong className="text-fg">{formatBRL(total)}</strong>
        </p>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-4" /> Nova conta
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={<Wallet className="size-6" />} title="Nenhuma conta" description="Cadastre contas para acompanhar o saldo." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data!.map((a) => (
            <Card key={a.id} className="flex items-center gap-3 p-4">
              <BankBadge id={a.bankId} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{a.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <span>{TYPES.find((t) => t.value === a.type)?.label}</span>
                  {a.member && (
                    <>
                      <span>·</span>
                      <Avatar name={a.member.displayName} src={a.member.user.avatarUrl} color={a.member.color} size={16} />
                      <span className="truncate">{a.member.displayName}</span>
                    </>
                  )}
                </div>
                <div className="tnum mt-1 text-lg font-bold">{formatBRL(a.balanceCents)}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" title="Importar extrato" aria-label="Importar extrato" onClick={() => setImportFor(a)}>
                  <Upload className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Editar conta" aria-label="Editar conta" onClick={() => { setEditing(a); setFormOpen(true); }}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Remover conta" aria-label="Remover conta" onClick={() => setToDelete(a)}>
                  <Trash2 className="size-4 text-negative" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      {importFor && (
        <ImportDialog
          open={!!importFor}
          onClose={() => setImportFor(null)}
          defaultKind="BANK"
          defaultTargetId={importFor.id}
          defaultTargetName={importFor.name}
          lockTarget
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
            toast.success("Conta removida");
            setToDelete(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Erro");
          }
        }}
        title="Remover conta"
        message={`Remover "${toDelete?.name}"? Se houver lançamentos, ela será arquivada.`}
        confirmLabel="Remover"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}

function AccountForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Account | null;
}) {
  const toast = useToast();
  const { create, update } = useAccountMutations();
  const members = useHousehold().data?.members ?? [];
  const [name, setName] = useState("");
  const [type, setType] = useState("CHECKING");
  const [opening, setOpening] = useState("");
  const [memberId, setMemberId] = useState("");
  const [bankId, setBankId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? "");
    setType(editing?.type ?? "CHECKING");
    setOpening(editing ? centsToMasked(editing.openingBalanceCents) : "");
    setMemberId(editing?.memberId ?? "");
    setBankId(editing?.bankId ?? null);
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome");
    let openingBalanceCents = 0;
    if (opening) {
      try {
        openingBalanceCents = toCents(opening);
      } catch {
        return setError("Saldo inicial inválido");
      }
    }
    try {
      const body = {
        name: name.trim(),
        type,
        openingBalanceCents,
        memberId: memberId || null,
        bankId,
      };
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      toast.success("Conta salva");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Editar conta" : "Nova conta"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button form="acc-form" type="submit" loading={create.isPending || update.isPending}>Salvar</Button>
        </>
      }
    >
      <form id="acc-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Conta corrente" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Dono">
            <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Compartilhada</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.displayName}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Banco">
          <BankPicker value={bankId} onChange={setBankId} />
        </Field>
        <Field label="Saldo inicial (R$)" error={error ?? undefined}>
          <MoneyInput value={opening} onChange={setOpening} />
        </Field>
      </form>
    </Dialog>
  );
}
