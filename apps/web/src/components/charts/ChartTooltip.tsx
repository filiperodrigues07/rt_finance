import type { ReactNode } from "react";

interface Item {
  name?: ReactNode;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/**
 * Tooltip compartilhado dos gráficos: card em bg-elevated, header (label) e
 * uma linha por série com bolinha da cor. Passe `formatter` para dinheiro.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  hideLabel,
}: {
  active?: boolean;
  payload?: Item[];
  label?: ReactNode;
  formatter?: (v: number) => string;
  hideLabel?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const fmt = (v: Item["value"]) =>
    typeof v === "number" && formatter ? formatter(v) : String(v ?? "");
  return (
    <div className="min-w-36 rounded-xl border border-border bg-elevated p-2.5 text-xs shadow-pop">
      {!hideLabel && label != null && label !== "" && (
        <div className="mb-1.5 font-semibold uppercase tracking-wide text-muted">{label}</div>
      )}
      <div className="space-y-1">
        {payload.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: it.color ?? "rgb(var(--muted))" }}
            />
            <span className="min-w-0 flex-1 truncate text-fg/80">{it.name}</span>
            <span className="tnum font-medium text-fg">{fmt(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
