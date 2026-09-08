import { useMemo, useState, type CSSProperties } from "react";
import { resolvePeriod, type PeriodPreset } from "@rt-finance/shared";
import { useDashboard, useFutureCommitment } from "@/lib/hooks";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/misc";
import { PageHeader, Stat, StatSkeleton } from "@/components/ui/data";
import {
  DonutCategories,
  MonthlyEvolutionChart,
  BreakdownBar,
  FutureCommitmentChart,
} from "@/components/charts/charts";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "LAST_MONTH", label: "Mês passado" },
  { value: "THIS_YEAR", label: "Este ano" },
];

/** índice do stagger de entrada */
const si = (i: number) => ({ "--rt-i": i }) as CSSProperties;

export function DashboardPage() {
  const [preset, setPreset] = useState<PeriodPreset>("THIS_MONTH");
  const range = useMemo(() => {
    const r = resolvePeriod(preset === "CUSTOM" ? "THIS_MONTH" : preset, {});
    return { from: r.from, to: r.to, months: 6 };
  }, [preset]);

  const { data, isLoading } = useDashboard(range);
  const future = useFutureCommitment(12);

  const period = data
    ? `${data.range.from.split("-").reverse().join("/")} – ${data.range.to.split("-").reverse().join("/")}`
    : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle={period}
        actions={
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
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {isLoading || !data ? (
          Array.from({ length: 5 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <Stat label="Saldo atual" cents={data.balanceCents} />
            <Stat label="Receitas" cents={data.incomeCents} tone="positive" />
            <Stat label="Despesas" cents={data.expenseCents} tone="negative" />
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

        <Card className="stagger-item lg:col-span-2" style={si(4)}>
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
