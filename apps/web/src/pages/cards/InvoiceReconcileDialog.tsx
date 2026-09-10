import { useEffect, useState } from "react";
import { Trash2, Check } from "lucide-react";
import { toCents } from "@rt-finance/shared";
import { useCategories, useInvoiceDetail, useInvoiceMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatBRL, formatDate, centsToMasked } from "@/lib/format";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={strong ? "font-medium text-fg" : "text-muted"}>{label}</span>
      <span className={strong ? "tnum font-semibold" : "tnum"}>{value}</span>
    </div>
  );
}

export function InvoiceReconcileDialog({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string | null;
}) {
  const toast = useToast();
  const detail = useInvoiceDetail(open ? invoiceId : null);
  const categories = useCategories();
  const { setInvoice, adjust, removeAdjustment, reconcile } = useInvoiceMutations();

  const d = detail.data;
  const [opening, setOpening] = useState("");
  const [statement, setStatement] = useState("");
  const [adjMode, setAdjMode] = useState(false);
  const [adjDesc, setAdjDesc] = useState("Ajuste de fatura");
  const [adjCat, setAdjCat] = useState("");

  useEffect(() => {
    if (!d) return;
    setOpening(d.openingBalanceCents ? centsToMasked(d.openingBalanceCents) : "");
    setStatement(d.statementTotalCents != null ? centsToMasked(d.statementTotalCents) : "");
    setAdjMode(false);
    setAdjDesc("Ajuste de fatura");
    setAdjCat("");
  }, [d]);

  async function run<T>(p: Promise<T>, ok: string) {
    try {
      await p;
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não deu certo");
    }
  }

  function saveField(field: "openingBalanceCents" | "statementTotalCents", masked: string) {
    if (!invoiceId) return;
    let cents: number | null;
    try {
      cents = masked.trim() ? toCents(masked) : field === "statementTotalCents" ? null : 0;
    } catch {
      return toast.error("Valor inválido");
    }
    void run(setInvoice.mutateAsync({ invoiceId, body: { [field]: cents } }), "Salvo");
  }

  const diff = d?.diffCents ?? 0;
  const busy = setInvoice.isPending || adjust.isPending || removeAdjustment.isPending || reconcile.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        d
          ? `Fatura ${d.referenceMonth.slice(0, 7).split("-").reverse().join("/")} · vence ${formatDate(d.dueDate)}`
          : "Fatura"
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {d && (
            <Button
              loading={reconcile.isPending}
              disabled={busy}
              onClick={() => invoiceId && run(reconcile.mutateAsync(invoiceId), "Fatura conferida")}
            >
              <Check className="size-4" /> Marcar como conferida
            </Button>
          )}
        </>
      }
    >
      {detail.isLoading || !d ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-5">
          {d.reconciledAt && (
            <p className="rounded-lg bg-positive/10 px-3 py-2 text-xs text-positive">
              Conferida em {formatDate(d.reconciledAt)}
            </p>
          )}

          {/* breakdown */}
          <div className="space-y-1.5 rounded-lg border border-border bg-surface-2 p-3">
            <Row label="Saldo inicial (não detalhado)" value={formatBRL(d.openingBalanceCents)} />
            <Row label="Lançamentos" value={formatBRL(d.itemizedCents)} />
            <Row label="Ajustes" value={formatBRL(d.adjustmentsCents)} />
            <div className="my-1 h-px bg-border" />
            <Row label="Total no app" value={formatBRL(d.totalCents)} strong />
          </div>

          {/* saldo inicial */}
          <Field
            label="Saldo inicial"
            hint="Valor que já estava nessa fatura e você não vai detalhar (parcelas antigas, compras anteriores ao app)."
          >
            <div className="flex gap-2">
              <MoneyInput value={opening} onChange={setOpening} />
              <Button
                variant="outline"
                size="sm"
                loading={setInvoice.isPending}
                onClick={() => saveField("openingBalanceCents", opening)}
              >
                Salvar
              </Button>
            </div>
          </Field>

          {/* conferência */}
          <Field label="Valor real da fatura" hint="O que veio no app/e-mail do banco. Deixe vazio se não for conferir.">
            <div className="flex gap-2">
              <MoneyInput value={statement} onChange={setStatement} />
              <Button
                variant="outline"
                size="sm"
                loading={setInvoice.isPending}
                onClick={() => saveField("statementTotalCents", statement)}
              >
                Salvar
              </Button>
            </div>
          </Field>

          {d.statementTotalCents != null && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Diferença (real − app)</span>
                <Badge tone={diff === 0 ? "positive" : "warning"}>
                  {diff === 0 ? "bate certinho" : formatBRL(diff)}
                </Badge>
              </div>

              {diff !== 0 && (
                <>
                  <p className="text-xs text-muted">
                    O app está {formatBRL(Math.abs(diff))} {diff > 0 ? "abaixo" : "acima"} da fatura real.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        invoiceId &&
                        run(
                          adjust.mutateAsync({ invoiceId, body: { mode: "opening" } }),
                          "Diferença somada ao saldo inicial",
                        )
                      }
                    >
                      Somar ao saldo inicial
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdjMode((v) => !v)}>
                      Criar lançamento de ajuste
                    </Button>
                  </div>

                  {adjMode && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <Field label="Descrição">
                        <Input value={adjDesc} onChange={(e) => setAdjDesc(e.target.value)} />
                      </Field>
                      <Field label="Categoria">
                        <Select value={adjCat} onChange={(e) => setAdjCat(e.target.value)}>
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
                      <Button
                        size="sm"
                        loading={adjust.isPending}
                        onClick={() =>
                          invoiceId &&
                          run(
                            adjust.mutateAsync({
                              invoiceId,
                              body: {
                                mode: "transaction",
                                description: adjDesc.trim() || "Ajuste de fatura",
                                categoryId: adjCat || null,
                              },
                            }),
                            "Lançamento de ajuste criado",
                          )
                        }
                      >
                        Lançar {formatBRL(Math.abs(diff))}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ajustes existentes */}
          {d.adjustments.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Ajustes</div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {d.adjustments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {a.description} <span className="text-xs text-muted">· {formatDate(a.date)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tnum">{formatBRL(a.amountCents)}</span>
                      <button
                        className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-negative"
                        aria-label="Remover ajuste"
                        onClick={() => run(removeAdjustment.mutateAsync(a.id), "Ajuste removido")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
