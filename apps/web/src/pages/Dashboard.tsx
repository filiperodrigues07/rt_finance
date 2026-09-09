import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Share2,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Gauge,
  Sparkles,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { resolvePeriod, todayIso, APP_TZ, type PeriodPreset, type Insight } from "@rt-finance/shared";
import {
  useDashboard,
  useFutureCommitment,
  useInsights,
  useCategoryTrend,
} from "@/lib/hooks";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input } from "@/components/ui/Field";
import { ShareDialog } from "@/components/ShareDialog";
import { Skeleton } from "@/components/ui/misc";
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
  const [preset, setPreset] = useState<PeriodPreset>("THIS_MONTH");
  const thisMonth = useMemo(() => resolvePeriod("THIS_MONTH", {}), []);
  const [customFrom, setCustomFrom] = useState(thisMonth.from);
  const [customTo, setCustomTo] = useState(todayIso(APP_TZ));

  const customValid = customFrom !== "" && customTo !== "" && customFrom <= customTo;

  const range = useMemo(() => {
    if (preset === "CUSTOM") {
      return customValid
        ? { from: customFrom, to: customTo, months: 6 }
        : { from: thisMonth.from, to: thisMonth.to, months: 6 };
    }
    const r = resolvePeriod(preset, {});
    return { from: r.from, to: r.to, months: 6 };
  }, [preset, customValid, customFrom, customTo, thisMonth.from, thisMonth.to]);

  const navigate = useNavigate();
  const { data, isLoading } = useDashboard(range);
  const future = useFutureCommitment(12);
  const insights = useInsights();
  const trend = useCategoryTrend(6);

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {isLoading || !data ? (
          Array.from({ length: 5 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <Stat label="Saldo atual" cents={data.balanceCents} />
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
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="stagger-item" style={si(0)}>
          <CardHeader title="Gastos por categoria" description="No período selecionado" />
          {isLoading || !data ? <Skeleton className="h-44" /> : <DonutCategories data={data.byCategory} />}
        </Card>

        <Card className="stagger-item" style={si(1)}>
          <CardHeader title="Evolução mensal" description="Receitas, despesas e saldo — 6 meses" />
          {isLoading || !data ? <Skeleton className="h-64" /> : <MonthlyEvolutionChart data={data.monthly} />}
        </Card>

        <Card className="stagger-item" style={si(2)}>
          <CardHeader title="Gastos por pessoa" />
          {isLoading || !data ? <Skeleton className="h-32" /> : <BreakdownBar data={data.byMember} />}
        </Card>

        <Card className="stagger-item" style={si(3)}>
          <CardHeader title="Gastos por cartão" />
          {isLoading || !data ? <Skeleton className="h-32" /> : <BreakdownBar data={data.byCard} />}
        </Card>

        {topTrend.length > 0 && (
          <Card className="stagger-item lg:col-span-2" style={si(4)}>
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
          </Card>
        )}

        <Card className="stagger-item lg:col-span-2" style={si(5)}>
          <CardHeader title="Comprometimento futuro" description="Parcelas a vencer nos próximos 12 meses" />
          {future.isLoading || !future.data ? (
            <Skeleton className="h-56" />
          ) : (
            <FutureCommitmentChart data={future.data} />
          )}
        </Card>
      </div>
    </div>
  );
}
