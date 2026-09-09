import { Download, FileSpreadsheet, FileText, Info } from "lucide-react";
import { firstDayOfMonth, lastDayOfMonth, todayIso, APP_TZ, formatBRL } from "@rt-finance/shared";
import { Tooltip } from "@/components/ui/Tooltip";
import { useCashFlow, useCategoryTrend, useByMember, usePace, useReportExport } from "@/lib/hooks";
import { getAccessToken } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { PageHeader, Stat } from "@/components/ui/data";
import { Skeleton, ChartSkeleton } from "@/components/ui/misc";
import {
  CashFlowChart,
  CategoryTrendChart,
  NetWorthChart,
  BreakdownBar,
} from "@/components/charts/charts";

export function ReportsPage() {
  const toast = useToast();
  const month = firstDayOfMonth(todayIso(APP_TZ), APP_TZ);
  const to = lastDayOfMonth(todayIso(APP_TZ), APP_TZ);
  const exp = useReportExport();
  const cashFlow = useCashFlow(6);
  const trend = useCategoryTrend(6);
  const member = useByMember({});
  const pace = usePace();

  async function downloadCsv() {
    try {
      const res = await fetch(`/api/reports/transactions.csv?from=${month}`, {
        headers: { authorization: `Bearer ${getAccessToken() ?? ""}` },
        credentials: "include",
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rt-finance-${month.slice(0, 7)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Falha ao exportar");
    }
  }

  async function runExport(kind: "pdf" | "xlsx") {
    try {
      await exp[kind].mutateAsync({ from: month, to });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Falha ao exportar");
    }
  }

  const exporting = exp.pdf.isPending || exp.xlsx.isPending;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Projeções, tendências e comparativos"
        actions={
          <Menu
            trigger={
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-fg hover:bg-surface-2">
                <Download className="size-3.5" /> {exporting ? "Exportando…" : "Exportar"}
              </span>
            }
            items={[
              { label: "Relatório em PDF", icon: <FileText className="size-4" />, onClick: () => runExport("pdf") },
              { label: "Relatório em Excel", icon: <FileSpreadsheet className="size-4" />, onClick: () => runExport("xlsx") },
              { label: "Transações em CSV", icon: <Download className="size-4" />, onClick: downloadCsv },
            ]}
          />
        }
      />

      {/* ritmo do mês */}
      {pace.isLoading || !pace.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={`Gasto · ${pace.data.monthLabel}`} value={formatBRL(pace.data.spentCents)} tone="negative" />
          <Stat
            label="Média por dia"
            value={formatBRL(pace.data.discretionaryPerDayCents)}
            hint={`gasto variável · ${pace.data.daysElapsed} de ${pace.data.daysInMonth} dias`}
          />
          {pace.data.daysElapsed < 5 ? (
            <div className="card col-span-2 flex items-center p-3 text-xs text-muted sm:p-4">
              Poucos dias no mês para projetar com confiança. As projeções aparecem a partir do 5º
              dia.
            </div>
          ) : (
            <>
              <Stat
                label={
                  <span className="inline-flex items-center gap-1">
                    Projeção de fim de mês
                    <Tooltip
                      side="top"
                      label={`${formatBRL(pace.data.spentSoFarCents)} já gasto + ${formatBRL(pace.data.knownBillsRemainingCents)} de contas fixas/agendadas que ainda vencem + ${formatBRL(pace.data.discretionaryPerDayCents)}/dia de gasto variável × ${pace.data.remainingDays} dias restantes`}
                    >
                      <Info className="size-3 text-muted" />
                    </Tooltip>
                  </span>
                }
                value={formatBRL(pace.data.projectedSpendCents)}
                foot={
                  <p className="text-[11px] leading-snug text-muted">
                    {formatBRL(pace.data.spentSoFarCents)} gasto + {formatBRL(pace.data.knownBillsRemainingCents)} a
                    vencer + {formatBRL(pace.data.discretionaryPerDayCents)}/dia × {pace.data.remainingDays}d
                  </p>
                }
              />
              <Stat
                label="Resultado projetado"
                value={formatBRL(pace.data.projectedResultCents)}
                tone={pace.data.projectedResultCents >= 0 ? "positive" : "negative"}
                foot={
                  <p className="text-[11px] leading-snug text-muted">
                    receita {formatBRL(pace.data.projectedIncomeCents)} − despesa{" "}
                    {formatBRL(pace.data.projectedSpendCents)}
                  </p>
                }
              />
            </>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Fluxo de caixa projetado" description="6 meses — entradas, saídas e saldo" />
          {cashFlow.isLoading || !cashFlow.data ? (
            <ChartSkeleton className="h-64" />
          ) : (
            <CashFlowChart data={cashFlow.data} />
          )}
        </Card>

        <Card>
          <CardHeader title="Patrimônio" description="Contas + metas ao longo de 12 meses" />
          {pace.isLoading || !pace.data ? (
            <ChartSkeleton className="h-56" />
          ) : (
            <NetWorthChart data={pace.data.netWorth} />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Tendência de gastos" description="Por categoria, últimos 6 meses" />
          {trend.isLoading || !trend.data ? (
            <ChartSkeleton className="h-64" />
          ) : (
            <CategoryTrendChart data={trend.data} />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Comparativo por pessoa" description="Gastos do mês" />
          {member.isLoading || !member.data ? (
            <ChartSkeleton className="h-40" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
              <BreakdownBar
                data={member.data.members.map((m) => ({
                  displayName: m.displayName,
                  color: m.color,
                  cents: m.expenseCents,
                  memberId: m.memberId,
                }))}
              />
              <div className="space-y-3">
                {member.data.members.map((m) => (
                  <div key={m.memberId} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="size-2 rounded-full" style={{ background: m.color }} />
                        {m.displayName}
                      </span>
                      <span className="tnum text-muted">
                        {formatBRL(m.expenseCents)} · {m.sharePercent}%
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.byCategory.slice(0, 4).map((c) => (
                        <span
                          key={c.categoryId ?? c.name}
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{ background: `${c.color}1f`, color: c.color }}
                        >
                          {c.icon} {formatBRL(c.cents)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
