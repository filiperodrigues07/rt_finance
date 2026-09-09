import { useEffect, useState } from "react";
import { todayIso, APP_TZ } from "@rt-finance/shared";
import { useAccounts, useInvoiceMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";

export interface PayInvoiceTarget {
  id: string;
  label: string;
  totalCents: number;
}

/** Paga uma fatura de cartão debitando a conta escolhida. */
export function PayInvoiceDialog({
  open,
  onClose,
  invoice,
}: {
  open: boolean;
  onClose: () => void;
  invoice: PayInvoiceTarget | null;
}) {
  const toast = useToast();
  const accounts = useAccounts();
  const { pay } = useInvoiceMutations();
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayIso(APP_TZ));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDate(todayIso(APP_TZ));
    setAccountId((accounts.data ?? [])[0]?.id ?? "");
  }, [open, accounts.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    if (!accountId) return setError("Escolha a conta");
    try {
      await pay.mutateAsync({ invoiceId: invoice.id, accountId, date });
      toast.success("Fatura paga");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível pagar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pagar fatura"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="pay-invoice-form" type="submit" loading={pay.isPending}>
            Pagar {invoice ? formatBRL(invoice.totalCents) : ""}
          </Button>
        </>
      }
    >
      <form id="pay-invoice-form" onSubmit={submit} className="space-y-4">
        {invoice && (
          <p className="text-sm text-muted">
            {invoice.label} — <strong className="text-fg">{formatBRL(invoice.totalCents)}</strong>
          </p>
        )}
        <Field label="Pagar com">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Selecione…</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data do pagamento" error={error ?? undefined}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
