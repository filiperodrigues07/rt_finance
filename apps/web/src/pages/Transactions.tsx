import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  Copy,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  MoreHorizontal,
  Upload,
  Zap,
  CheckCircle2,
  Tag,
  User,
  FileDown,
  Paperclip,
  Rows3,
  Rows4,
} from "lucide-react";
import { useDensity } from "@/lib/useDensity";
import type { ListTransactionsQuery } from "@rt-finance/shared";
import { resolvePeriod, APP_TZ, toCents } from "@rt-finance/shared";
import {
  useCategories,
  useCreditCards,
  useAccounts,
  useHousehold,
  useTransactionMutations,
  useTransactions,
  useReportExport,
} from "@/lib/hooks";
import { formatBRL, formatDate, centsToMasked } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Badge, EmptyState, Skeleton, RowSkeleton } from "@/components/ui/misc";
import { PageHeader, Stat } from "@/components/ui/data";
import { Menu } from "@/components/ui/Menu";
import { Segmented } from "@/components/ui/Segmented";
import { Dialog } from "@/components/ui/Dialog";
import { Sheet } from "@/components/ui/Sheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { TransactionForm } from "./transactions/TransactionForm";
import { ImportDialog } from "@/components/ImportDialog";
import { Attachments } from "@/components/Attachments";
import type { TransactionRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Agendado",
  CONFIRMED: "Confirmado",
  CLEARED: "Compensado",
  CANCELED: "Cancelado",
};

const FILTER_KEYS = [
  "search",
  "type",
  "categoryId",
  "memberId",
  "creditCardId",
  "accountId",
  "from",
  "to",
  "minCents",
  "maxCents",
] as const;
const todayIsoDate = () => new Date().toISOString().slice(0, 10);

function readFilters(sp: URLSearchParams): Partial<ListTransactionsQuery> {
  const f: Partial<ListTransactionsQuery> = { page: Number(sp.get("page")) || 1, pageSize: 20 };
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (!v) continue;
    if (k === "minCents" || k === "maxCents") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) (f as Record<string, unknown>)[k] = n;
    } else {
      (f as Record<string, unknown>)[k] = v;
    }
  }
  return f;
}

/** "1.234,56" (ou "150") → "123456" centavos em string p/ a URL; inválido/vazio → undefined. */
function reaisToCentsParam(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  try {
    const c = toCents(t);
    return c > 0 ? String(c) : undefined;
  } catch {
    return undefined;
  }
}
const centsParamToReais = (v: string | number | undefined) =>
  v ? centsToMasked(Number(v)) : "";

export function TransactionsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { dense, toggle: toggleDensity } = useDensity();
  const [sp, setSp] = useSearchParams();
  const view = sp.get("view") === "apagar" ? "apagar" : "todas";
  const filters = useMemo(() => {
    const f = readFilters(sp);
    return view === "apagar" ? { ...f, scheduled: true } : f;
  }, [sp, view]);

  const [showFilters, setShowFilters] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formSeed, setFormSeed] = useState<string | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [toDelete, setToDelete] = useState<TransactionRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<TransactionRow | null>(null);
  const [attachTarget, setAttachTarget] = useState<TransactionRow | null>(null);
  const [quick, setQuick] = useState("");
  // inputs de faixa de valor em reais (o commit p/ a URL é em centavos, no blur/Enter)
  const [minVal, setMinVal] = useState("");
  const [maxVal, setMaxVal] = useState("");
  useEffect(() => {
    setMinVal(centsParamToReais(sp.get("minCents") ?? undefined));
    setMaxVal(centsParamToReais(sp.get("maxCents") ?? undefined));
  }, [sp]);

  const { data, isLoading, isError, error, refetch } = useTransactions(filters);
  const categories = useCategories();
  const cards = useCreditCards();
  const accounts = useAccounts();
  const household = useHousehold();
  const tx = useTransactionMutations();
  const report = useReportExport();

  const rows = data?.data ?? [];
  const members = household.data?.members ?? [];

  function patch(next: Record<string, string | undefined>, resetPage = true) {
    const p = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (resetPage) p.delete("page");
    setSp(p, { replace: true });
    setSelected(new Set());
  }

  function applyPreset(preset: "THIS_MONTH" | "LAST_MONTH" | "L30") {
    if (preset === "L30") {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      patch({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
      return;
    }
    const r = resolvePeriod(preset, { tz: APP_TZ });
    patch({ from: r.from, to: r.to });
  }

  const activeChips = FILTER_KEYS.filter((k) => k !== "search" && filters[k as keyof typeof filters]);
  const catName = (id?: string) => categories.data?.find((c) => c.id === id);
  const memberName = (id?: string) => members.find((m) => m.id === id)?.displayName;
  const cardName = (id?: string) => cards.data?.find((c) => c.id === id)?.name;
  const accName = (id?: string) => accounts.data?.find((a) => a.id === id)?.name;

  const chipLabel = (k: string): string => {
    const raw = filters[k as keyof typeof filters];
    if (raw == null || raw === "") return "";
    if (k === "minCents") return `≥ ${formatBRL(Number(raw))}`;
    if (k === "maxCents") return `≤ ${formatBRL(Number(raw))}`;
    const v = String(raw);
    if (k === "type") return v === "EXPENSE" ? "Despesa" : "Receita";
    if (k === "categoryId") return catName(v) ? `${catName(v)!.icon} ${catName(v)!.name}` : "Categoria";
    if (k === "memberId") return memberName(v) ?? "Responsável";
    if (k === "creditCardId") return cardName(v) ?? "Cartão";
    if (k === "accountId") return accName(v) ?? "Conta";
    if (k === "from") return `de ${formatDate(v)}`;
    if (k === "to") return `até ${formatDate(v)}`;
    return v;
  };

  function commitRange() {
    patch({
      minCents: reaisToCentsParam(minVal),
      maxCents: reaisToCentsParam(maxVal),
    });
  }

  // ---------- seleção ----------
  // parcelas de cartão não podem ser excluídas/pagas/recategorizadas em massa
  const selectableRows = rows.filter((r) => !r.installmentId);
  const allPageSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected(allPageSelected ? new Set() : new Set(selectableRows.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  const selIds = [...selected];

  async function bulk<T>(p: Promise<T & { affected: number; skipped: { reason: string }[] }>, verb: string) {
    try {
      const r = await p;
      const skips = r.skipped.length;
      const reason = skips ? ` (${r.skipped[0]!.reason}${skips > 1 ? `, +${skips - 1}` : ""})` : "";
      if (r.affected === 0 && skips > 0) {
        toast.error(`Nada ${verb}: ${skips} ignorado(s)${reason}`);
      } else {
        toast.success(`${r.affected} ${verb}${skips ? ` · ${skips} ignorado(s)${reason}` : ""}`);
      }
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : `Erro ao ${verb}`);
    }
  }

  // ---------- quick add ----------
  async function submitQuick() {
    const text = quick.trim();
    if (!text) return;
    try {
      const created = await tx.quickAdd.mutateAsync(text);
      setQuick("");
      toast.success(
        `${created.type === "INCOME" ? "Receita" : "Despesa"} de ${formatBRL(created.amountCents)} — ${created.description}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setFormSeed(text);
        setEditing(null);
        setQuick("");
        setFormOpen(true);
      } else {
        toast.error(e instanceof ApiError ? e.message : "Não consegui lançar");
      }
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await tx.remove.mutateAsync(toDelete.id);
      toast.success("Lançamento excluído");
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir");
    }
  }

  const rowMenu = (t: TransactionRow) => (
    <Menu
      label="Ações do lançamento"
      trigger={
        <span className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
          <MoreHorizontal className="size-4" />
        </span>
      }
      items={[
        ...(t.status === "PENDING" && !t.installmentId
          ? [{ label: "Marcar como pago", icon: <CheckCircle2 className="size-4" />, onClick: () => setPayTarget(t) }]
          : []),
        { label: "Anexos (boleto/comprovante)", icon: <Paperclip className="size-4" />, onClick: () => setAttachTarget(t) },
        { label: "Duplicar", icon: <Copy className="size-4" />, onClick: () => onDuplicate(t.id), disabled: !!t.transferGroupId },
        {
          label: "Editar",
          icon: <Pencil className="size-4" />,
          onClick: () => {
            setEditing(t);
            setFormOpen(true);
          },
          disabled: !!t.installmentId || !!t.transferGroupId,
        },
        t.installmentId
          ? {
              label: "Cancelar parcelamento (Carteira → Cartões)",
              icon: <Trash2 className="size-4" />,
              onClick: () => navigate("/carteira?tab=cartoes"),
              danger: true,
            }
          : { label: "Excluir", icon: <Trash2 className="size-4" />, onClick: () => setToDelete(t), danger: true },
      ]}
    />
  );

  async function onDuplicate(id: string) {
    try {
      await tx.duplicate.mutateAsync(id);
      toast.success("Lançamento duplicado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao duplicar");
    }
  }

  const isOverdue = (t: TransactionRow) => t.dueDate != null && t.dueDate.slice(0, 10) < todayIsoDate();

  return (
    <div>
      <PageHeader
        title="Transações"
        subtitle={data ? `${data.total} lançamentos` : undefined}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Importar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormSeed(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Novo
            </Button>
          </>
        }
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} defaultKind="BANK" />

      <Segmented
        className="mb-4"
        value={view}
        onChange={(v) => patch({ view: v === "todas" ? undefined : v })}
        options={[
          { value: "todas", label: "Todas" },
          { value: "apagar", label: "A pagar" },
        ]}
      />

      {/* lançamento rápido */}
      <div className="relative mb-3">
        <Zap className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-accent" />
        <Input
          className="pl-8 pr-24"
          placeholder='Lançamento rápido: "gastei 50 no mercado ontem"'
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitQuick()}
        />
        <Button
          size="sm"
          className="absolute right-1 top-1"
          loading={tx.quickAdd.isPending}
          onClick={submitQuick}
          disabled={!quick.trim()}
        >
          Lançar
        </Button>
      </div>

      {/* busca + filtros */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input
            className="pl-8"
            placeholder="Buscar por descrição, nota ou valor…"
            value={filters.search ?? ""}
            onChange={(e) => patch({ search: e.target.value || undefined })}
          />
        </div>
        <Button
          variant={activeChips.length ? "primary" : "outline"}
          size="md"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="size-4" />
          Filtros{activeChips.length ? ` (${activeChips.length})` : ""}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={toggleDensity}
          title={dense ? "Linhas confortáveis" : "Linhas compactas"}
          aria-label="Densidade da tabela"
        >
          {dense ? <Rows3 className="size-4" /> : <Rows4 className="size-4" />}
        </Button>
      </div>

      {(activeChips.length > 0 || (filters.from && filters.to)) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {activeChips.map((k) => (
            <button
              key={k}
              onClick={() => patch({ [k]: undefined })}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-fg"
            >
              {chipLabel(k)}
              <X className="size-3 text-muted" />
            </button>
          ))}
          <button
            onClick={() => patch(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])))}
            className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      )}

      {showFilters && (
        <Card className="animate-in mb-4 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["THIS_MONTH", "LAST_MONTH", "L30"] as const).map((p) => (
              <Button key={p} variant="secondary" size="sm" onClick={() => applyPreset(p)}>
                {p === "THIS_MONTH" ? "Este mês" : p === "LAST_MONTH" ? "Mês passado" : "Últimos 30 dias"}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Select value={filters.type ?? ""} onChange={(e) => patch({ type: e.target.value || undefined })}>
              <option value="">Tipo</option>
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </Select>
            <Select value={filters.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value || undefined })}>
              <option value="">Categoria</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
            <Select value={filters.memberId ?? ""} onChange={(e) => patch({ memberId: e.target.value || undefined })}>
              <option value="">Responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
            <Select value={filters.creditCardId ?? ""} onChange={(e) => patch({ creditCardId: e.target.value || undefined })}>
              <option value="">Cartão</option>
              {(cards.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={filters.accountId ?? ""} onChange={(e) => patch({ accountId: e.target.value || undefined })}>
              <option value="">Conta</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <div className="col-span-2 flex gap-2 sm:col-span-1">
              <Input type="date" value={filters.from ?? ""} onChange={(e) => patch({ from: e.target.value || undefined })} />
              <Input type="date" value={filters.to ?? ""} onChange={(e) => patch({ to: e.target.value || undefined })} />
            </div>
            <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
              <MoneyInput
                placeholder="de R$"
                aria-label="Valor mínimo"
                value={minVal}
                onChange={setMinVal}
                onBlur={commitRange}
                onKeyDown={(e) => e.key === "Enter" && commitRange()}
              />
              <span className="text-xs text-muted">até</span>
              <MoneyInput
                placeholder="R$"
                aria-label="Valor máximo"
                value={maxVal}
                onChange={setMaxVal}
                onBlur={commitRange}
                onKeyDown={(e) => e.key === "Enter" && commitRange()}
              />
            </div>
          </div>
        </Card>
      )}

      {view === "apagar" && rows.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="A pagar" value={String(rows.length)} />
          <Stat
            label="Total"
            value={formatBRL(rows.reduce((s, r) => s + r.amountCents, 0))}
          />
          <Stat
            label="Vencidas"
            value={String(rows.filter(isOverdue).length)}
            tone={rows.some(isOverdue) ? "negative" : undefined}
          />
        </div>
      )}

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Não consegui carregar os lançamentos" />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={view === "apagar" ? "Nada a pagar" : "Nenhum lançamento"}
          description={
            view === "apagar"
              ? "Contas agendadas aparecem aqui até você marcar como pagas."
              : "Ajuste os filtros ou registre um novo lançamento."
          }
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> Novo lançamento
            </Button>
          }
        />
      ) : (
        <>
          {/* desktop */}
          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className={"w-full text-sm" + (dense ? " table-dense" : "")}>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="size-4 accent-[rgb(var(--accent))]" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Data</th>
                  {view === "apagar" && <th className="px-4 py-3 text-left font-medium">Vencimento</th>}
                  <th className="px-4 py-3 text-left font-medium">Descrição</th>
                  <th className="px-4 py-3 text-left font-medium">Categoria</th>
                  <th className="px-4 py-3 text-left font-medium">Resp.</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-left font-medium">{view === "apagar" ? "" : "Status"}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.id}
                    className={
                      "border-b border-border/60 last:border-0 hover:bg-surface-2/40 " +
                      (selected.has(t.id) ? "bg-accent/5" : "")
                    }
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleOne(t.id)}
                        disabled={!!t.installmentId}
                        title={t.installmentId ? "Parcela de cartão — gerencie pelo parcelamento" : undefined}
                        className="size-4 accent-[rgb(var(--accent))] disabled:opacity-30"
                      />
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-muted">{formatDate(t.date)}</td>
                    {view === "apagar" && (
                      <td className="tnum whitespace-nowrap px-4 py-3">
                        {t.dueDate ? (
                          <span className={isOverdue(t) ? "font-medium text-negative" : ""}>
                            {formatDate(t.dueDate)}
                            {isOverdue(t) && " ⚠"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.description}</div>
                      <div className="text-xs text-muted">
                        {t.creditCard ? `${t.creditCard.icon} ${t.creditCard.name}` : (t.account?.name ?? "—")}
                        {t.installmentId ? " · parcela" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {t.category ? (
                        <Badge color={t.category.color}>
                          {t.category.icon} {t.category.name}
                        </Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: t.member.color }} />
                        {t.member.displayName}
                      </span>
                    </td>
                    <td
                      className={
                        "tnum whitespace-nowrap px-4 py-3 text-right font-semibold " +
                        (t.type === "INCOME" ? "text-positive" : "text-fg")
                      }
                    >
                      {t.type === "INCOME" ? "+" : "−"} {formatBRL(t.amountCents)}
                    </td>
                    <td className="px-4 py-3">
                      {view === "apagar" ? (
                        !t.installmentId && (
                          <Button size="sm" variant="outline" onClick={() => setPayTarget(t)}>
                            Pagar
                          </Button>
                        )
                      ) : (
                        <Badge>{STATUS_LABEL[t.status]}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{rowMenu(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* mobile */}
          <div className={"space-y-2 sm:hidden " + (selected.size ? "pb-24" : "")}>
            {rows.map((t) => (
              <Card key={t.id} className={"p-3 " + (selected.has(t.id) ? "ring-1 ring-accent" : "")}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleOne(t.id)}
                    disabled={!!t.installmentId}
                    className="mt-1 size-4 shrink-0 accent-[rgb(var(--accent))] disabled:opacity-30"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.description}</div>
                    <div className="text-xs text-muted">
                      {view === "apagar" && t.dueDate ? (
                        <span className={isOverdue(t) ? "text-negative" : ""}>vence {formatDate(t.dueDate)}</span>
                      ) : (
                        formatDate(t.date)
                      )}{" "}
                      · {t.member.displayName}
                    </div>
                    {t.category && (
                      <div className="mt-1">
                        <Badge color={t.category.color}>
                          {t.category.icon} {t.category.name}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={
                        "tnum font-semibold " + (t.type === "INCOME" ? "text-positive" : "text-fg")
                      }
                    >
                      {t.type === "INCOME" ? "+" : "−"} {formatBRL(t.amountCents)}
                    </span>
                    <div className="flex items-center">
                      {view === "apagar" && !t.installmentId && (
                        <Button size="sm" variant="outline" onClick={() => setPayTarget(t)}>
                          Pagar
                        </Button>
                      )}
                      {rowMenu(t)}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {data && data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => {
                  const p = new URLSearchParams(sp);
                  p.set("page", String(data.page - 1));
                  setSp(p, { replace: true });
                }}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tnum">
                {data.page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.totalPages}
                onClick={() => {
                  const p = new URLSearchParams(sp);
                  p.set("page", String(data.page + 1));
                  setSp(p, { replace: true });
                }}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* barra de ações em massa */}
      {selected.size > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-14 z-40 border-t border-border bg-surface/95 p-3 backdrop-blur lg:bottom-0 lg:pl-[260px]">
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
            <span className="shrink-0 text-sm font-medium">{selected.size} selecionado(s)</span>
            <div className="hidden flex-1 sm:block" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar
            </Button>
            <Menu
              trigger={
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs">
                  <Tag className="size-3.5" /> Categoria
                </span>
              }
              items={(categories.data ?? [])
                .filter((c) => !c.archivedAt)
                .map((c) => ({
                  label: `${c.icon} ${c.name}`,
                  onClick: () =>
                    bulk(tx.bulkCategorize.mutateAsync({ ids: selIds, categoryId: c.id }), "recategorizado(s)"),
                }))}
            />
            <Menu
              trigger={
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs">
                  <User className="size-3.5" /> Responsável
                </span>
              }
              items={members.map((m) => ({
                label: m.displayName,
                onClick: () => bulk(tx.bulkCategorize.mutateAsync({ ids: selIds, memberId: m.id }), "atualizado(s)"),
              }))}
            />
            <Button
              size="sm"
              variant="outline"
              loading={report.pdf.isPending || report.xlsx.isPending}
              onClick={() => report.xlsx.mutate({ ids: selIds })}
            >
              <FileDown className="size-3.5" /> Exportar
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={tx.bulkPay.isPending}
              onClick={() => bulk(tx.bulkPay.mutateAsync(selIds), "pago(s)")}
            >
              <CheckCircle2 className="size-3.5" /> Marcar pago
            </Button>
            <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="size-3.5" /> Excluir
            </Button>
          </div>
        </div>
      )}

      <TransactionForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setFormSeed(undefined);
        }}
        editing={editing}
        seedDescription={formSeed}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir lançamento"
        message={`Remover "${toDelete?.description}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        loading={tx.remove.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          await bulk(tx.bulkDelete.mutateAsync(selIds), "excluído(s)");
          setBulkDeleteOpen(false);
        }}
        title={`Excluir ${selected.size} lançamento(s)`}
        message="Parcelas e transferências serão ignoradas. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        loading={tx.bulkDelete.isPending}
      />

      <PayDialog
        target={payTarget}
        accounts={(accounts.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
        onClose={() => setPayTarget(null)}
        onConfirm={async (body) => {
          try {
            await tx.pay.mutateAsync({ id: payTarget!.id, body });
            toast.success("Baixado como pago");
            setPayTarget(null);
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Erro ao baixar");
          }
        }}
        loading={tx.pay.isPending}
      />

      <Sheet
        open={!!attachTarget}
        onClose={() => setAttachTarget(null)}
        title={attachTarget ? `Anexos — ${attachTarget.description}` : "Anexos"}
      >
        {attachTarget && (
          <Attachments
            transactionId={attachTarget.id}
            defaultKind={attachTarget.status === "PENDING" ? "BOLETO" : "RECEIPT"}
          />
        )}
      </Sheet>
    </div>
  );
}

function PayDialog({
  target,
  accounts,
  onClose,
  onConfirm,
  loading,
}: {
  target: TransactionRow | null;
  accounts: { id: string; name: string }[];
  onClose: () => void;
  onConfirm: (body: { date?: string; accountId?: string }) => void;
  loading: boolean;
}) {
  const [date, setDate] = useState(todayIsoDate());
  const [accountId, setAccountId] = useState("");
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title="Marcar como pago"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={loading} onClick={() => onConfirm({ date, accountId: accountId || undefined })}>
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {target?.description} — <span className="tnum">{target ? formatBRL(target.amountCents) : ""}</span>
        </p>
        <Field label="Data do pagamento">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Conta (opcional — mantém a atual se vazio)">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Manter atual</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
