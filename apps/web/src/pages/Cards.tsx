import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Layers, Receipt, Upload, Share2 } from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { PayInvoiceDialog, type PayInvoiceTarget } from "@/components/PayInvoiceDialog";
import { formatBRL, formatDate } from "@/lib/format";
import { percentOf } from "@rt-finance/shared";
import { ListToolbar, useListPrefs, type SortOption } from "@/components/ui/ListToolbar";
import {
  useCardInvoices,
  useCreditCardMutations,
  useCreditCards,
  useInstallmentMutations,
  useInstallmentPlans,
} from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/Avatar";
import { BankBadge } from "@/components/ui/BankBadge";
import { bankById } from "@rt-finance/shared";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CardForm } from "./cards/CardForm";
import { InstallmentForm } from "./cards/InstallmentForm";
import type { CreditCard as CardT } from "@/lib/types";

const INVOICE_STATUS: Record<string, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  PAID: "Paga",
  OVERDUE: "Vencida",
};

type CardSort = "name" | "limit" | "available" | "usage";
const CARD_SORTS: SortOption<CardSort>[] = [
  { value: "name", label: "Nome" },
  { value: "limit", label: "Limite" },
  { value: "available", label: "Disponível" },
  { value: "usage", label: "Uso (%)" },
];
function sortCards(rows: CardT[], by: CardSort): CardT[] {
  const use = (c: CardT) => percentOf(c.limits.usedCents, c.limits.limitCents || 1);
  return [...rows].sort((a, b) => {
    switch (by) {
      case "limit":
        return b.limits.limitCents - a.limits.limitCents;
      case "available":
        return b.limits.availableCents - a.limits.availableCents;
      case "usage":
        return use(b) - use(a);
      default:
        return a.name.localeCompare(b.name, "pt-BR");
    }
  });
}

export function CardsPage() {
  const toast = useToast();
  const { data: cards, isLoading } = useCreditCards();
  const { remove } = useCreditCardMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CardT | null>(null);
  const [toDelete, setToDelete] = useState<CardT | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [instFor, setInstFor] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<CardT | null>(null);
  const { sort, setSort, view, setView } = useListPrefs<CardSort>("cards", "name");
  const shown = useMemo(() => sortCards(cards ?? [], sort), [cards, sort]);
  const count = (cards ?? []).length;

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast.success("Cartão removido");
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao remover");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {count} {count === 1 ? "cartão" : "cartões"}
        </p>
        <div className="flex items-center gap-2">
          {count > 1 && (
            <ListToolbar
              sort={sort}
              setSort={setSort}
              sortOptions={CARD_SORTS}
              view={view}
              setView={setView}
            />
          )}
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Novo cartão
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : count === 0 ? (
        <EmptyState title="Nenhum cartão" description="Cadastre um cartão para acompanhar faturas e parcelas." />
      ) : view === "list" ? (
        <div className="space-y-2">
          {shown.map((c) => (
            <CardListRow
              key={c.id}
              card={c}
              open={selected === c.id}
              onToggle={() => setSelected(selected === c.id ? null : c.id)}
              onEdit={() => { setEditing(c); setFormOpen(true); }}
              onDelete={() => setToDelete(c)}
              onInstallment={() => setInstFor(c.id)}
              onImport={() => setImportFor(c)}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((c) => {
            const used = c.limits.usedCents;
            const pct = percentOf(used, c.limits.limitCents || 1);
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {c.bankId ? (
                      <BankBadge id={c.bankId} size={36} />
                    ) : (
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-lg"
                        style={{ background: `${c.color}22` }}
                      >
                        {c.icon}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{c.name}</span>
                        {c.member && (
                          <Avatar
                            name={c.member.displayName}
                            src={c.member.user.avatarUrl}
                            color={c.member.color}
                            size={16}
                          />
                        )}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {bankById(c.bankId)?.name ?? c.bank ?? "—"}
                        {c.last4 ? ` · final ${c.last4}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" title="Editar cartão" aria-label="Editar cartão" onClick={() => { setEditing(c); setFormOpen(true); }}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Remover cartão" aria-label="Remover cartão" onClick={() => setToDelete(c)}>
                      <Trash2 className="size-4 text-negative" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>Utilizado {formatBRL(used)}</span>
                    <span>Limite {formatBRL(c.limits.limitCents)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        background: pct >= 90 ? "rgb(var(--negative))" : c.color,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Disponível <strong className="text-fg">{formatBRL(c.limits.availableCents)}</strong> · fecha dia {c.closingDay} · vence dia {c.dueDay}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected(selected === c.id ? null : c.id)}>
                    <Receipt className="size-4" /> Faturas
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setInstFor(c.id)}>
                    <Layers className="size-4" /> Parcelar compra
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setImportFor(c)}>
                    <Upload className="size-4" /> Importar fatura
                  </Button>
                </div>

                {selected === c.id && <CardDetail cardId={c.id} />}
              </Card>
            );
          })}
        </div>
      )}

      <CardForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      {instFor && (
        <InstallmentForm open={!!instFor} onClose={() => setInstFor(null)} creditCardId={instFor} />
      )}
      {importFor && (
        <ImportDialog
          open={!!importFor}
          onClose={() => setImportFor(null)}
          defaultKind="CARD"
          defaultTargetId={importFor.id}
          defaultTargetName={importFor.name}
          lockTarget
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Remover cartão"
        message={`Remover "${toDelete?.name}"? Se houver lançamentos, ele será apenas inativado.`}
        confirmLabel="Remover"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}

function CardListRow({
  card: c,
  open,
  onToggle,
  onEdit,
  onDelete,
  onInstallment,
  onImport,
}: {
  card: CardT;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onInstallment: () => void;
  onImport: () => void;
}) {
  const pct = percentOf(c.limits.usedCents, c.limits.limitCents || 1);
  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {c.bankId ? (
            <BankBadge id={c.bankId} size={32} />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-lg text-base" style={{ background: `${c.color}22` }}>
              {c.icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{c.name}</span>
              {c.member && (
                <Avatar name={c.member.displayName} src={c.member.user.avatarUrl} color={c.member.color} size={14} />
              )}
            </div>
            <div className="truncate text-xs text-muted">
              {bankById(c.bankId)?.name ?? c.bank ?? "—"}
              {c.last4 ? ` · final ${c.last4}` : ""}
            </div>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <div className="tnum text-sm font-semibold">{formatBRL(c.limits.availableCents)}</div>
            <div className="text-[11px] text-muted">disp. de {formatBRL(c.limits.limitCents)}</div>
          </div>
          <div className="hidden h-8 w-16 shrink-0 items-end lg:flex">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? "rgb(var(--negative))" : c.color }}
              />
            </div>
          </div>
        </button>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" title="Editar cartão" aria-label="Editar cartão" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Remover cartão" aria-label="Remover cartão" onClick={onDelete}>
            <Trash2 className="size-4 text-negative" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onInstallment}>
              <Layers className="size-4" /> Parcelar compra
            </Button>
            <Button variant="outline" size="sm" onClick={onImport}>
              <Upload className="size-4" /> Importar fatura
            </Button>
          </div>
          <CardDetail cardId={c.id} />
        </div>
      )}
    </Card>
  );
}

function CardDetail({ cardId }: { cardId: string }) {
  const invoices = useCardInvoices(cardId);
  const plans = useInstallmentPlans();
  const { cancel } = useInstallmentMutations();
  const toast = useToast();
  const cardPlans = (plans.data ?? []).filter((p) => p.creditCard.id === cardId);
  const [shareInvoiceId, setShareInvoiceId] = useState<string | null>(null);
  const [payInvoice, setPayInvoice] = useState<PayInvoiceTarget | null>(null);

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div>
        <CardHeader title="Faturas" />
        {invoices.isLoading ? (
          <Skeleton className="h-16" />
        ) : (invoices.data ?? []).length === 0 ? (
          <p className="text-xs text-muted">Nenhuma fatura ainda.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {invoices.data!.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between">
                <span className="text-muted">
                  {inv.referenceMonth.slice(0, 7).split("-").reverse().join("/")} · vence {formatDate(inv.dueDate)}
                </span>
                <span className="flex items-center gap-2">
                  <Badge>{INVOICE_STATUS[inv.status]}</Badge>
                  <strong className="tnum">{formatBRL(inv.totalCents)}</strong>
                  {inv.status !== "PAID" && inv.totalCents > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPayInvoice({
                          id: inv.id,
                          label: `Fatura ${inv.referenceMonth.slice(0, 7).split("-").reverse().join("/")}`,
                          totalCents: inv.totalCents,
                        })
                      }
                    >
                      Pagar
                    </Button>
                  )}
                  <button
                    className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
                    onClick={() => setShareInvoiceId(inv.id)}
                    aria-label="Compartilhar fatura"
                  >
                    <Share2 className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ShareDialog
        open={!!shareInvoiceId}
        onClose={() => setShareInvoiceId(null)}
        kind="invoice"
        id={shareInvoiceId ?? undefined}
      />

      <PayInvoiceDialog open={!!payInvoice} onClose={() => setPayInvoice(null)} invoice={payInvoice} />

      <div>
        <CardHeader title="Compras parceladas" />
        {cardPlans.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma compra parcelada.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {cardPlans.map((p) => {
              const paid = p.installments.filter((i) => i.status === "PAID" || i.status === "BILLED").length;
              return (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.description}</div>
                    <div className="text-xs text-muted">
                      {p.installmentCount}× · {formatBRL(p.totalCents)} · {paid}/{p.installmentCount} lançadas
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await cancel.mutateAsync(p.id);
                        toast.success("Parcelamento cancelado");
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : "Erro");
                      }
                    }}
                  >
                    Cancelar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
