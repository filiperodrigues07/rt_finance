import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Line,
  Area,
  AreaChart,
  ComposedChart,
  Legend,
} from "recharts";
import type {
  CategorySlice,
  MemberSlice,
  CardSlice,
  MonthlyPoint,
  FutureCommitmentMonth,
  CashFlowMonth,
  CategoryTrend,
} from "@rt-finance/shared";
import { formatBRL, fromCents, shortMonth } from "@/lib/format";
import { useChartTheme } from "@/lib/chart-theme";
import { EmptyState } from "@/components/ui/misc";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compactBRL = (reais: number) =>
  "R$ " + reais.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const tooltipStyle = {
  background: "rgb(var(--surface))",
  border: "1px solid rgb(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "rgb(var(--fg))",
  boxShadow: "0 1px 2px rgb(0 0 0 / 0.2), 0 12px 40px -12px rgb(0 0 0 / 0.5)",
} as const;

const tooltipProps = {
  contentStyle: tooltipStyle,
  itemStyle: { color: "rgb(var(--fg))", fontWeight: 500 },
  labelStyle: { color: "rgb(var(--muted))", fontWeight: 600, marginBottom: 2 },
  cursor: { fill: "rgb(var(--fg) / 0.05)" },
} as const;

/** eixos comuns — sem linha, sem tick, fonte 11 */
function axisTick(fill: string) {
  return { fontSize: 11, fill };
}
const gridDash = "2 4";

export function DonutCategories({ data }: { data: CategorySlice[] }) {
  const t = useChartTheme();
  const top = data.slice(0, 6);
  const rest = data.slice(6);
  const restCents = rest.reduce((a, c) => a + c.cents, 0);
  const slices =
    restCents > 0
      ? [
          ...top,
          { categoryId: null, name: "Outros", icon: "•", color: "rgb(148 163 184)", cents: restCents, percent: 0 },
        ]
      : top;

  if (slices.length === 0) return <EmptyState title="Sem despesas no período" />;

  const total = slices.reduce((a, s) => a + s.cents, 0);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative h-44 w-full sm:w-44">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              dataKey="cents"
              nameKey="name"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={!t.reduced}
              animationDuration={450}
              animationEasing="ease-out"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => brl(v)} {...tooltipProps} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wide text-muted">Total</span>
          <span className="money text-sm font-semibold">{compactBRL(fromCents(total))}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.cents / total) * 100) : 0;
          return (
            <li key={s.name} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 truncate">
                {s.icon} {s.name}
              </span>
              <span className="tnum shrink-0 text-xs text-muted">{pct}%</span>
              <span className="money w-24 shrink-0 text-right text-muted">{formatBRL(s.cents)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MonthlyEvolutionChart({ data }: { data: MonthlyPoint[] }) {
  const t = useChartTheme();
  const rows = data.map((d) => ({
    month: shortMonth(d.month),
    Receitas: fromCents(d.incomeCents),
    Despesas: fromCents(d.expenseCents),
    Saldo: fromCents(d.balanceCents),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ left: -12, right: 8, top: 4 }}>
          <CartesianGrid stroke={t.grid} strokeDasharray={gridDash} vertical={false} />
          <XAxis dataKey="month" tick={axisTick(t.axis)} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={axisTick(t.axis)}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip formatter={(v: number) => brl(v)} {...tooltipProps} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Receitas" fill={t.positive} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={!t.reduced} animationDuration={450} />
          <Bar dataKey="Despesas" fill={t.negative} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={!t.reduced} animationDuration={450} />
          <Line dataKey="Saldo" stroke={t.accent} strokeWidth={2} dot={false} isAnimationActive={!t.reduced} animationDuration={550} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreakdownBar({ data }: { data: (MemberSlice | CardSlice)[] }) {
  const t = useChartTheme();
  if (data.length === 0) return <EmptyState title="Sem dados no período" />;
  const rows = data.map((d) => ({
    name: "displayName" in d ? d.displayName : d.name,
    color: d.color,
    value: fromCents(d.cents),
  }));
  return (
    <div style={{ height: Math.max(120, rows.length * 44) }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: "rgb(var(--fg))" }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip formatter={(v: number) => [brl(v), "Gasto"]} {...tooltipProps} />
          <Bar dataKey="value" radius={6} maxBarSize={26} isAnimationActive={!t.reduced} animationDuration={450}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FutureCommitmentChart({ data }: { data: FutureCommitmentMonth[] }) {
  const t = useChartTheme();
  const rows = data.map((d) => ({ month: shortMonth(d.month), value: fromCents(d.cents) }));
  const total = data.reduce((a, d) => a + d.cents, 0);
  if (total === 0)
    return <EmptyState title="Nenhuma parcela futura" description="Compras parceladas aparecem aqui." />;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: -12, right: 8, top: 4 }}>
          <defs>
            <linearGradient id="fc-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.accent} stopOpacity={0.9} />
              <stop offset="100%" stopColor={t.accent} stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray={gridDash} vertical={false} />
          <XAxis dataKey="month" tick={axisTick(t.axis)} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={axisTick(t.axis)}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip formatter={(v: number) => [brl(v), "Parcelas"]} {...tooltipProps} />
          <Bar dataKey="value" fill="url(#fc-grad)" radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={!t.reduced} animationDuration={450} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowChart({ data }: { data: CashFlowMonth[] }) {
  const t = useChartTheme();
  const rows = data.map((d) => ({
    month: shortMonth(d.month),
    Entradas: fromCents(d.incomeCents),
    Saídas: -fromCents(d.expenseCents),
    Saldo: fromCents(d.runningBalanceCents),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ left: -12, right: 8, top: 6 }}>
          <CartesianGrid stroke={t.grid} strokeDasharray={gridDash} vertical={false} />
          <XAxis dataKey="month" tick={axisTick(t.axis)} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={axisTick(t.axis)}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip formatter={(v: number) => brl(Math.abs(v))} {...tooltipProps} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Entradas" fill={t.positive} radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={!t.reduced} animationDuration={450} />
          <Bar dataKey="Saídas" fill={t.negative} radius={[0, 0, 3, 3]} maxBarSize={20} isAnimationActive={!t.reduced} animationDuration={450} />
          <Line dataKey="Saldo" stroke={t.accent} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={!t.reduced} animationDuration={550} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryTrendChart({ data }: { data: CategoryTrend }) {
  const t = useChartTheme();
  if (!data.series.length) return <EmptyState title="Sem histórico de gastos" />;
  const rows = data.months.map((m, i) => {
    const row: Record<string, number | string> = { month: shortMonth(m) };
    for (const s of data.series) row[s.name] = fromCents(s.points[i] ?? 0);
    return row;
  });
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ left: -12, right: 8, top: 6 }}>
          <defs>
            {data.series.map((s, i) => (
              <linearGradient key={i} id={`ct-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray={gridDash} vertical={false} />
          <XAxis dataKey="month" tick={axisTick(t.axis)} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={axisTick(t.axis)}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip formatter={(v: number) => brl(v)} {...tooltipProps} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {data.series.map((s, i) => (
            <Area
              key={s.name}
              dataKey={s.name}
              stackId="1"
              stroke={s.color}
              fill={`url(#ct-grad-${i})`}
              strokeWidth={1.5}
              isAnimationActive={!t.reduced}
              animationDuration={450}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetWorthChart({ data }: { data: { month: string; cents: number }[] }) {
  const t = useChartTheme();
  const rows = data.map((d) => ({ month: shortMonth(d.month), Patrimônio: fromCents(d.cents) }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ left: -12, right: 8, top: 6 }}>
          <defs>
            <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={t.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray={gridDash} vertical={false} />
          <XAxis dataKey="month" tick={axisTick(t.axis)} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={axisTick(t.axis)}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip formatter={(v: number) => brl(v)} {...tooltipProps} />
          <Area
            dataKey="Patrimônio"
            stroke={t.accent}
            strokeWidth={2}
            fill="url(#nw)"
            isAnimationActive={!t.reduced}
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Minigráfico de área, sem eixos/grid/tooltip — para dentro de cards e legendas. */
export function Sparkline({
  data,
  color,
  className = "h-8 w-24",
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  const t = useChartTheme();
  if (!data || data.length < 2) return null;
  const rows = data.map((v, i) => ({ i, v }));
  const stroke = color ?? t.accent;
  const id = `spark-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={className}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            dataKey="v"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${id})`}
            isAnimationActive={!t.reduced}
            animationDuration={400}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
