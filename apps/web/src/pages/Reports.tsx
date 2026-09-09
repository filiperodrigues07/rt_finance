import { Download, FileSpreadsheet, FileText, Info, Sparkles, Lightbulb, RefreshCw } from "lucide-react";
import { firstDayOfMonth, lastDayOfMonth, todayIso, APP_TZ, formatBRL } from "@rt-finance/shared";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  useCashFlow,
  useCategoryTrend,
  useByMember,
  usePace,
  useReportExport,
  useReportAnalysis,
} from "@/lib/hooks";
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
  const analysis = useReportAnalysis();

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

      {/* análise do mês (IA) */}
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-accent" /> Análise do mês
            {analysis.data && (
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {analysis.data.fonte === "ia" ? "gerado por IA" : "por regras"}
              </span>
            )}
          </div>
          {analysis.data && (
            <Button
              variant="ghost"
              size="sm"
              loading={analysis.regenerate.isPending}
              onClick={() => analysis.regenerate.mutate()}
            >
              <RefreshCw className="size-3.5" /> Gerar de novo
            </Button>
          )}
        </div>

        {analysis.isFetching || analysis.regenerate.isPending ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Sparkles className="size-4 animate-pulse text-accent" />
              <span>Analisando o mês</span>
              <span className="inline-flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s] motion-reduce:animate-none" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s] motion-reduce:animate-none" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none" />
              </span>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
            <p className="text-[11px] text-muted/70">A IA leva alguns segundos.</p>
          </div>
        ) : analysis.data ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm leading-relaxed text-fg/90">{analysis.data.resumo}</p>
            <ul className="space-y-1.5">
              {analysis.data.recomendacoes.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-fg/80">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted">
              gerado {new Date(analysis.data.geradoEm).toLocaleString("pt-BR")}
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col items-start gap-2">
            <p className="text-sm text-muted">
              Um resumo do mês em linguagem natural: o que está indo bem, o que merece atenção e o
              que fazer.
            </p>
            <Button
              size="sm"
              loading={analysis.isFetching}
              onClick={() => void analysis.refetch()}
            >
              <Sparkles className="size-4" /> Analisar meu mês
            </Button>
            {analysis.isError && (
              <p className="text-xs text-negative">Não consegui gerar agora. Tente de novo.</p>
            )}
          </div>
        )}
      </Card>

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
