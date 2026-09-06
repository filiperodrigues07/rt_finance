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
import { EmptyState } from "@/components/ui/misc";

// Recharts aplica stroke/fill como ATRIBUTO em <line>/<path>, onde var() do CSS não
// resolve — então aqui vão valores concretos. Só os *Style (inline style) usam var().
const AXIS = "rgb(150 146 138 / 0.9)";
const GRID = "rgb(150 146 138 / 0.16)";
const ACCENT = "#3B82F6"; // azul (padrão); os *Style de tooltip seguem o tema via var()

function money(v: number): string {
  return formatBRL(v);
}
function compact(v: number): string {
  return fromCents(v).toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
}

const tooltipStyle = {
  background: "rgb(var(--surface))",
  border: "1px solid rgb(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "rgb(var(--fg))",
  boxShadow: "0 8px 30px -12px rgb(0 0 0 / 0.5)",
} as const;

/** Props completas de <Tooltip> — força cores legíveis do texto no tema escuro. */
const tooltipProps = {
  contentStyle: tooltipStyle,
  itemStyle: { color: "rgb(var(--fg))" },
  labelStyle: { color: "rgb(var(--muted))", fontWeight: 600, marginBottom: 2 },
  cursor: { fill: "rgb(var(--fg) / 0.06)" },
} as const;

export function DonutCategories({ data }: { data: CategorySlice[] }) {
  const top = data.slice(0, 6);
  const rest = data.slice(6);
  const restCents = rest.reduce((a, c) => a + c.cents, 0);
  const slices = restCents > 0 ? [...top, { categoryId: null, name: "Outros", icon: "•", color: "#94A3B8", cents: restCents, percent: 0 }] : top;

  if (slices.length === 0) return <EmptyState title="Sem despesas no período" />;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-44 w-full sm:w-44">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="cents" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => money(v)} {...tooltipProps} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate">
              {s.icon} {s.name}
            </span>
            <span className="tnum text-muted">{money(s.cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MonthlyEvolutionChart({ data }: { data: MonthlyPoint[] }) {
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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            {...tooltipProps}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Receitas" fill="rgb(var(--positive))" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="Despesas" fill="rgb(var(--negative))" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Line dataKey="Saldo" stroke={ACCENT} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreakdownBar({
  data,
}: {
  data: (MemberSlice | CardSlice)[];
}) {
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
          <Tooltip
            formatter={(v: number) => [
              v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              "Gasto",
            ]}
            {...tooltipProps}
          />
          <Bar dataKey="value" radius={6} maxBarSize={26}>
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
  const rows = data.map((d) => ({ month: shortMonth(d.month), value: fromCents(d.cents) }));
  const total = data.reduce((a, d) => a + d.cents, 0);
  if (total === 0) return <EmptyState title="Nenhuma parcela futura" description="Compras parceladas aparecem aqui." />;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: -12, right: 8, top: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => compact(v * 100)} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            formatter={(v: number) => [
              v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              "Parcelas",
            ]}
            {...tooltipProps}
          />
          <Bar dataKey="value" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowChart({ data }: { data: CashFlowMonth[] }) {
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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip
            formatter={(v: number) => Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            {...tooltipProps}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Entradas" fill="rgb(var(--positive))" radius={[3, 3, 0, 0]} maxBarSize={20} />
          <Bar dataKey="Saídas" fill="rgb(var(--negative))" radius={[0, 0, 3, 3]} maxBarSize={20} />
          <Line dataKey="Saldo" stroke={ACCENT} strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryTrendChart({ data }: { data: CategoryTrend }) {
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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip
            formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            {...tooltipProps}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {data.series.map((s) => (
            <Area
              key={s.name}
              dataKey={s.name}
              stackId="1"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.18}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetWorthChart({ data }: { data: { month: string; cents: number }[] }) {
  const rows = data.map((d) => ({ month: shortMonth(d.month), Patrimônio: fromCents(d.cents) }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ left: -12, right: 8, top: 6 }}>
          <defs>
            <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact" })}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip
            formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            {...tooltipProps}
          />
          <Area dataKey="Patrimônio" stroke={ACCENT} strokeWidth={2} fill="url(#nw)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
