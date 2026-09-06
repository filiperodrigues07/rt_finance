import { useEffect, useMemo, useState } from "react";
import { toCents, splitInstallments, formatBRL, todayIso, APP_TZ } from "@rt-finance/shared";
import { useCategories, useInstallmentMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";

export function InstallmentForm({
  open,
  onClose,
  creditCardId,
}: {
  open: boolean;
  onClose: () => void;
  creditCardId: string;
}) {
  const toast = useToast();
  const categories = useCategories();
  const { create } = useInstallmentMutations();

  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("12");
  const [purchaseDate, setPurchaseDate] = useState(todayIso(APP_TZ));
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDescription("");
      setTotal("");
      setCount("12");
      setPurchaseDate(todayIso(APP_TZ));
      setCategoryId("");
      setError(null);
    }
  }, [open]);

  const preview = useMemo(() => {
    try {
      const cents = toCents(total);
      const n = Number(count);
      if (cents <= 0 || n < 2) return null;
      const parts = splitInstallments(cents, n);
      return { first: parts[0]!, n };
    } catch {
      return null;
    }
  }, [total, count]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let totalCents: number;
    try {
      totalCents = toCents(total);
    } catch {
      return setError("Valor total inválido");
    }
    const n = Number(count);
    if (totalCents <= 0) return setError("Informe o valor total");
    if (n < 2 || n > 60) return setError("Parcelas entre 2 e 60");
    if (!description.trim()) return setError("Informe a descrição");

    try {
      await create.mutateAsync({
        creditCardId,
        description: description.trim(),
        totalCents,
        installmentCount: n,
        purchaseDate,
        categoryId: categoryId || null,
      });
      toast.success("Compra parcelada registrada");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nova compra parcelada"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="inst-form" type="submit" loading={create.isPending}>
            Registrar
          </Button>
        </>
      }
    >
      <form id="inst-form" onSubmit={submit} className="space-y-4">
        <Field label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="TV 55''" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor total (R$)">
            <Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="2.400,00" />
          </Field>
          <Field label="Parcelas">
            <Input type="number" min={2} max={60} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data da compra">
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {(categories.data ?? [])
                .filter((c) => c.kind !== "INCOME")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        {preview && (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            {preview.n}× de <strong>{formatBRL(preview.first)}</strong>
          </div>
        )}
        {error && <p className="text-xs text-negative">{error}</p>}
      </form>
    </Dialog>
  );
}
