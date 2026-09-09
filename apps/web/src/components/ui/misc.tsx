import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

/** Skeleton com o sweep de brilho (para blocos maiores: cards, gráficos). */
export function Shimmer({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("skeleton-shimmer", className)} style={style} />;
}

/** Placeholder com a forma de um card (título curto + bloco de conteúdo). */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("card space-y-3 p-4", className)}>
      <Shimmer className="h-3 w-24 rounded" />
      <Shimmer className="h-24 w-full rounded-lg" />
    </div>
  );
}

/** Placeholder com a forma de um gráfico (baseline + colunas). */
export function ChartSkeleton({ className = "h-56" }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-2 px-1", className)}>
      {[38, 62, 45, 78, 55, 88, 40].map((h, i) => (
        <Shimmer key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

/** Placeholder com a forma de uma tabela. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card divide-y divide-border p-0">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className={cn("h-3 rounded", c === 0 ? "w-8 shrink-0" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder com a forma de uma linha de lista (marcador + 2 linhas + valor). */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="skeleton size-4 shrink-0 rounded" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="skeleton h-3 w-2/5 rounded" />
        <div className="skeleton h-2.5 w-1/4 rounded" />
      </div>
      <div className="skeleton h-4 w-16 shrink-0 rounded" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} />;
}

type BadgeTone = "neutral" | "positive" | "negative" | "warning" | "accent";
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  positive: "bg-positive/12 text-positive",
  negative: "bg-negative/12 text-negative",
  warning: "bg-warning/12 text-warning",
  accent: "bg-accent/12 text-accent",
};

export function Badge({
  children,
  color,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  /** cor hex livre (ex.: categoria). Tem prioridade sobre `tone`. */
  color?: string;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        !color && BADGE_TONE[tone],
        className,
      )}
      style={color ? { backgroundColor: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      {icon && (
        <div className="mb-1 grid size-11 place-items-center rounded-full bg-accent/10 text-accent">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />;
}

export function Row({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3", className)} {...props} />;
}
