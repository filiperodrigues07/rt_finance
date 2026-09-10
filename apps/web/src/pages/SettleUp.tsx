import { useMemo, useState } from "react";
import { resolvePeriod, APP_TZ } from "@rt-finance/shared";
import { useSettleUp, useSettleUpMutation } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { PageHeader } from "@/components/ui/data";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton, EmptyState } from "@/components/ui/misc";

export function SettleUpPage() {
  const toast = useToast();
  const [preset, setPreset] = useState<"THIS_MONTH" | "LAST_MONTH">("THIS_MONTH");
  const range = useMemo(() => resolvePeriod(preset, { tz: APP_TZ }), [preset]);
  const { data, isLoading } = useSettleUp(range.from, range.to);
  const settle = useSettleUpMutation();

  async function doSettle() {
    try {
      const r = await settle.mutateAsync({ from: range.from, to: range.to });
      if (r.ok) toast.success(`Acerto registrado: ${formatBRL(r.amountCents ?? 0)}`);
      else toast.error(r.reason ?? "Não deu certo");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Acerto do casal" subtitle="Quem pagou mais no período — e quanto o outro deve." />

      <Segmented
        value={preset}
        onChange={setPreset}
        options={[
          { value: "THIS_MONTH", label: "Este mês" },
          { value: "LAST_MONTH", label: "Mês passado" },
        ]}
      />

      {isLoading || !data ? (
        <Skeleton className="h-40" />
      ) : data.totalCents === 0 ? (
        <EmptyState title="Sem despesas no período" description="Lance gastos nos dois nomes para calcular o acerto." />
      ) : (
        <>
          <Card className="space-y-2">
            {data.perMember.map((m) => (
              <div key={m.memberId} className="flex items-center justify-between text-sm">
                <span>{m.displayName} pagou</span>
                <span className="tnum font-medium">{formatBRL(m.paidCents)}</span>
              </div>
            ))}
            <div className="my-1 h-px bg-border" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Total do período</span>
              <span className="tnum font-semibold">{formatBRL(data.totalCents)}</span>
            </div>
          </Card>

          <Card>
            {data.net ? (
              <div className="space-y-3">
                <p className="text-sm">
                  <strong>{data.net.fromName}</strong> deve{" "}
                  <strong className="text-accent">{formatBRL(data.net.cents)}</strong> para{" "}
                  <strong>{data.net.toName}</strong>.
                </p>
                <Button size="sm" loading={settle.isPending} onClick={doSettle}>
                  Registrar acerto
                </Button>
                <p className="text-xs text-muted">
                  Cria uma transferência entre as contas padrão das duas pessoas (defina em Configurações →
                  Personalização).
                </p>
              </div>
            ) : (
              <p className="text-sm text-positive">Está quitado — ninguém deve nada. 🎉</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
