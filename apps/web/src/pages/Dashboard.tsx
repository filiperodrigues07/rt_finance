import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { QuickAddChips } from "@/components/QuickAddChips";
import {
  Share2,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Gauge,
  Sparkles,
  ChevronRight,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { resolvePeriod, todayIso, APP_TZ, type PeriodPreset, type Insight } from "@rt-finance/shared";
import { getPrefs, patchPrefs } from "@/lib/preferences";
import {
  useDashboard,
  useFutureCommitment,
  useInsights,
  useCategoryTrend,
  useCategories,
  useHousehold,
  useAccounts,
  useCreditCards,
} from "@/lib/hooks";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input } from "@/components/ui/Field";
import { ShareDialog } from "@/components/ShareDialog";
import { ChartSkeleton } from "@/components/ui/misc";
import { PageHeader, Stat, StatSkeleton } from "@/components/ui/data";
import {
  DonutCategories,
  MonthlyEvolutionChart,
  BreakdownBar,
  FutureCommitmentChart,
  Sparkline,
} from "@/components/charts/charts";

const INSIGHT_ICON: Record<string, LucideIcon> = {
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  activity: Activity,
  "alert-triangle": AlertTriangle,
  gauge: Gauge,
};

const INSIGHT_TONE: Record<Insight["severity"], string> = {
  bad: "text-negative",
  warn: "text-warning",
  info: "text-accent",
};

/** Variação % vs. período anterior (guarda prev<=0). */
function deltaPct(cur: number, prev: number): number {
  if (!prev || prev <= 0) return 0;
  return Math.round(((cur - prev) / prev) * 100);
}

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "LAST_MONTH", label: "Mês passado" },
  { value: "THIS_YEAR", label: "Este ano" },
  { value: "CUSTOM", label: "Personalizado" },
];

/** índice do stagger de entrada */
const si = (i: number) => ({ "--rt-i": i }) as CSSProperties;

export function DashboardPage() {
  const [preset, setPreset] = useState<PeriodPreset>(() => getPrefs().defaultPeriod);
  const thisMonth = useMemo(() => resolvePeriod("THIS_MONTH", {}), []);
  const [customFrom, setCustomFrom] = useState(thisMonth.from);
  const [customTo, setCustomTo] = useState(todayIso(APP_TZ));

  const customValid = customFrom !== "" && customTo !== "" && customFrom <= customTo;

  const [filters, setFilters] = useState<{
    memberId?: string;
    categoryId?: string;
    accountId?: string;
    creditCardId?: string;
  }>({});
  const setFilter = (k: keyof typeof filters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  const clearFilters = () => setFilters({});
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(false);

  const range = useMemo(() => {
    const base =
      preset === "CUSTOM"
        ? customValid
          ? { from: customFrom, to: customTo }
          : { from: thisMonth.from, to: thisMonth.to }
        : (() => {
            const r = resolvePeriod(preset, {});
            return { from: r.from, to: r.to };
          })();
    return { ...base, months: 6, ...filters };
  }, [preset, customValid, customFrom, customTo, thisMonth.from, thisMonth.to, filters]);

  const navigate = useNavigate();
  const { data, isLoading } = useDashboard(range);
  const future = useFutureCommitment(12);
  const insights = useInsights();
  const trend = useCategoryTrend(6);
  const categories = useCategories();
  const household = useHousehold();
  const accounts = useAccounts();
  const cards = useCreditCards();
  const members = household.data?.members ?? [];

  const [shareOpen, setShareOpen] = useState(false);

  const isThisMonth = preset === "THIS_MONTH";
  const topTrend = (trend.data?.series ?? [])
    .filter((s) => s.points.some((p) => p > 0))
    .slice(0, 4);

  const period = data
    ? `${data.range.from.split("-").reverse().join("/")} – ${data.range.to.split("-").reverse().join("/")}`
    : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle={period}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShareOpen(true)}>
              <Share2 className="size-4" /> Compartilhar
            </Button>
            <Button
              variant={activeFilterCount ? "secondary" : "ghost"}
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="size-4" /> Filtros
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold text-accent">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Select
              value={preset}
              onChange={(e) => setPreset(e.target.value as PeriodPreset)}
              className="w-40"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </>
        }
      />

      <QuickAddChips />

      {showFilters && (
        <div className="-mt-2 grid gap-2 rounded-xl border border-border bg-surface-2/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={filters.memberId ?? ""} onChange={(e) => setFilter("memberId", e.target.value)}>
            <option value="">Todas as pessoas</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))}
          </Select>
          <Select value={filters.categoryId ?? ""} onChange={(e) => setFilter("categoryId", e.target.value)}>
            <option value="">Todas as categorias</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </Select>
          <Select value={filters.accountId ?? ""} onChange={(e) => setFilter("accountId", e.target.value)}>
            <option value="">Todas as contas</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Select value={filters.creditCardId ?? ""} onChange={(e) => setFilter("creditCardId", e.target.value)}>
            <option value="">Todos os cartões</option>
            {(cards.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </Select>
        </div>
      )}

      {activeFilterCount > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {filters.memberId && (
            <FilterChip label={members.find((m) => m.id === filters.memberId)?.displayName} onClear={() => setFilter("memberId", "")} />
          )}
          {filters.categoryId && (
            <FilterChip label={categories.data?.find((c) => c.id === filters.categoryId)?.name} onClear={() => setFilter("categoryId", "")} />
          )}
          {filters.accountId && (
            <FilterChip label={accounts.data?.find((a) => a.id === filters.accountId)?.name} onClear={() => setFilter("accountId", "")} />
          )}
          {filters.creditCardId && (
            <FilterChip label={cards.data?.find((c) => c.id === filters.creditCardId)?.name} onClear={() => setFilter("creditCardId", "")} />
          )}
          <button onClick={clearFilters} className="text-muted underline hover:text-fg">
            limpar
          </button>
        </div>
      )}

      {preset === "CUSTOM" && (
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            aria-label="Data inicial"
            className="w-auto"
          />
          <span className="text-sm text-muted">até</span>
          <Input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-label="Data final"
            className="w-auto"
          />
          {!customValid && (
            <span className="text-xs text-negative">A data final tem que ser depois da inicial.</span>
          )}
        </div>
      )}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        kind="month"
        range={{ from: range.from, to: range.to }}
      />

      {isThisMonth && insights.data && insights.data.length > 0 && (
        <Card className="stagger-item" style={si(0)}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-accent" /> Destaques
              </span>
            }
            description="Comparado ao mês passado"
          />
          <ul className="mt-1 divide-y divide-border">
            {insights.data.map((it) => {
              const Icon = INSIGHT_ICON[it.icon] ?? Activity;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => it.link && navigate(it.link)}
                    className={`flex w-full items-start gap-3 py-2.5 text-left ${it.link ? "hover:opacity-80" : "cursor-default"}`}
                  >
                    <Icon className={`mt-0.5 size-4 shrink-0 ${INSIGHT_TONE[it.severity]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{it.title}</span>
                      <span className="block text-xs text-muted">{it.detail}</span>
                    </span>
                    {it.link && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isLoading || !data ? (
        <div className="grid gap-3 lg:grid-cols-4">
          <StatSkeleton className="h-full min-h-28 lg:col-span-2 lg:row-span-2" />
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          <Stat
            variant="hero"
            className="lg:col-span-2 lg:row-span-2"
            label="Saldo total"
            cents={data.balanceCents}
            foot={
              data.monthly.length > 1 && (
                <Sparkline data={data.monthly.map((m) => m.balanceCents)} className="h-12 w-full" />
              )
            }
          />
          <Stat
            label="Receitas"
            cents={data.incomeCents}
            tone="positive"
            delta={{ pct: deltaPct(data.incomeCents, data.prev.incomeCents), goodWhenUp: true }}
          />
          <Stat
            label="Despesas"
            cents={data.expenseCents}
            tone="negative"
            delta={{ pct: deltaPct(data.expenseCents, data.prev.expenseCents), goodWhenUp: false }}
          />
          <Stat label="Faturas em aberto" cents={data.invoicesOpenCents} />
          <Stat label="Vence em 15 dias" cents={data.upcomingDueCents} hint="faturas de cartão" />
        </div>
      )}

      <DashboardGrid
        widgets={[
          {
            id: "byCategory",
            body: (
              <>
                <CardHeader title="Gastos por categoria" description="No período selecionado" />
                {isLoading || !data ? <ChartSkeleton className="h-44" /> : <DonutCategories data={data.byCategory} />}
              </>
            ),
          },
          {
            id: "monthly",
            body: (
              <>
                <CardHeader title="Evolução mensal" description="Receitas, despesas e saldo — 6 meses" />
                {isLoading || !data ? <ChartSkeleton className="h-64" /> : <MonthlyEvolutionChart data={data.monthly} />}
              </>
            ),
          },
          {
            id: "byMember",
            body: (
              <>
                <CardHeader title="Gastos por pessoa" />
                {isLoading || !data ? <ChartSkeleton className="h-32" /> : <BreakdownBar data={data.byMember} />}
              </>
            ),
          },
          {
            id: "byCard",
            body: (
              <>
                <CardHeader title="Gastos por cartão" description="Fatura atual de cada cartão" />
                {isLoading || !data ? <ChartSkeleton className="h-32" /> : <BreakdownBar data={data.byCard} />}
              </>
            ),
          },
          {
            id: "trend",
            span: 2,
            hideWhenEmpty: topTrend.length === 0,
            body: (
              <>
                <CardHeader title="Tendência por categoria" description="Últimos 6 meses" />
                <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {topTrend.map((s) => {
                    const last = s.points[s.points.length - 1] ?? 0;
                    const prev = s.points[s.points.length - 2] ?? 0;
                    const d = deltaPct(last, prev);
                    return (
                      <li key={s.categoryId ?? s.name} className="flex items-center gap-3">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                        {d !== 0 && (
                          <span className={`tnum text-xs ${d > 0 ? "text-negative" : "text-positive"}`}>
                            {d > 0 ? "▲" : "▼"} {Math.abs(d)}%
                          </span>
                        )}
                        <Sparkline data={s.points} color={s.color} className="h-8 w-24 shrink-0" />
                      </li>
                    );
                  })}
                </ul>
              </>
            ),
          },
          {
            id: "future",
            span: 2,
            body: (
              <>
                <CardHeader title="Comprometimento futuro" description="Parcelas a vencer nos próximos 12 meses" />
                {future.isLoading || !future.data ? (
                  <ChartSkeleton className="h-56" />
                ) : (
                  <FutureCommitmentChart data={future.data} />
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

type Widget = { id: string; body: ReactNode; span?: 2; hideWhenEmpty?: boolean };

const WIDGET_LABEL: Record<string, string> = {
  byCategory: "Gastos por categoria",
  monthly: "Evolução mensal",
  byMember: "Gastos por pessoa",
  byCard: "Gastos por cartão",
  trend: "Tendência por categoria",
  future: "Comprometimento futuro",
};

/** Grade de cards do Dashboard — ordem e visibilidade personalizáveis (preferences.dashboard). */
function DashboardGrid({ widgets }: { widgets: Widget[] }) {
  const [editing, setEditing] = useState(false);
  const prefs = getPrefs().dashboard;
  const [order, setOrder] = useState<string[]>(() => {
    const ids = widgets.map((w) => w.id);
    const kept = prefs.order.filter((id) => ids.includes(id));
    return [...kept, ...ids.filter((id) => !kept.includes(id))];
  });
  const [hidden, setHidden] = useState<string[]>(() => prefs.hidden ?? []);

  const byId = new Map(widgets.map((w) => [w.id, w]));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };
  const toggleHidden = (id: string) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  const save = () => {
    patchPrefs({ dashboard: { order, hidden } });
    setEditing(false);
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => (editing ? save() : setEditing(true))}
          className="text-xs text-muted hover:text-fg"
        >
          {editing ? "Concluir" : "Personalizar"}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {order.map((id, i) => {
          const w = byId.get(id);
          if (!w) return null;
          const isHidden = hidden.includes(id);
          if (!editing && (isHidden || w.hideWhenEmpty)) return null;
          return (
            <Card
              key={id}
              className={cn("stagger-item", w.span === 2 && "lg:col-span-2", isHidden && "opacity-45")}
              style={si(i)}
            >
              {editing && (
                <div className="mb-2 flex items-center gap-1 border-b border-border pb-2 text-xs text-muted">
                  <span className="flex-1 font-medium text-fg">{WIDGET_LABEL[id] ?? id}</span>
                  <button className="p-1 hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button
                    className="p-1 hover:text-fg disabled:opacity-30"
                    disabled={i === order.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button className="p-1 hover:text-fg" onClick={() => toggleHidden(id)}>
                    {isHidden ? "mostrar" : "esconder"}
                  </button>
                </div>
              )}
              {w.body}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label?: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5">
      {label ?? "—"}
      <button onClick={onClear} aria-label="Remover filtro" className="text-muted hover:text-fg">
        <X className="size-3" />
      </button>
    </span>
  );
}
