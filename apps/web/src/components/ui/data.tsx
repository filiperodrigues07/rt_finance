import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Money } from "./Money";

/** KPI / número grande — sans, tabular, legível. Passe `cents` p/ dinheiro (com count-up). */
export function Stat({
  label,
  value,
  cents,
  hint,
  icon,
  tone,
  delta,
  variant = "default",
  foot,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  cents?: number;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "positive" | "negative" | "muted";
  /** Comparativo com o período anterior. `goodWhenUp`: subir é bom (receita) ou ruim (despesa). */
  delta?: { pct: number; goodWhenUp?: boolean } | null;
  /** `hero` = número maior + espaço para um `foot` (sparkline/linha extra). */
  variant?: "default" | "hero";
  foot?: ReactNode;
  className?: string;
}) {
  const hero = variant === "hero";
  return (
    <div className={cn("card overflow-hidden p-3 sm:p-4", hero && "sm:p-5", className)}>
      <div className="flex items-center gap-1.5 truncate text-[11px] uppercase tracking-wide text-muted sm:text-xs">
        {icon}
        {label}
      </div>
      <div className={cn("flex items-baseline gap-2", hero ? "mt-2 sm:mt-3" : "mt-1.5 sm:mt-2")}>
        <div
          className={cn(
            "truncate font-semibold tracking-tight",
            hero ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl",
            cents == null && "tnum",
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
            tone === "muted" && "text-muted",
          )}
        >
          {cents != null ? <Money cents={cents} animate /> : value}
        </div>
        {delta && Number.isFinite(delta.pct) && delta.pct !== 0 && <DeltaChip {...delta} />}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted">{hint}</div>}
      {foot && <div className={cn(hero ? "mt-3" : "mt-2")}>{foot}</div>}
    </div>
  );
}

export function DeltaChip({ pct, goodWhenUp = true }: { pct: number; goodWhenUp?: boolean }) {
  const up = pct > 0;
  const good = up === goodWhenUp;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tnum",
        good ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
      )}
      title="vs. período anterior"
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

/** Placeholder com a forma do <Stat> (rótulo curto + número grande). */
export function StatSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("card p-4", className)}>
      <div className="skeleton h-2.5 w-16 rounded" />
      <div className="skeleton mt-3 h-6 w-24 rounded" />
    </div>
  );
}

/** Anima de 0 até `target` no mount; respeita prefers-reduced-motion. */
function useAnimatedValue(target: number, enabled: boolean) {
  const [v, setV] = useState(enabled ? 0 : target);
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) {
      setV(target);
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      done.current = true;
      return;
    }
    const id = requestAnimationFrame(() => {
      setV(target);
      done.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [target, enabled]);
  return v;
}

/** Barra de progresso simples (0–100+). `animateIn` sobe de 0 no mount. */
export function Progress({
  percent,
  color,
  animateIn = false,
  className,
}: {
  percent: number;
  color?: string;
  animateIn?: boolean;
  className?: string;
}) {
  const over = percent > 100;
  const w = useAnimatedValue(Math.min(percent, 100), animateIn);
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-smooth"
        style={{
          width: `${w}%`,
          background: over ? "rgb(var(--negative))" : (color ?? "rgb(var(--accent))"),
        }}
      />
    </div>
  );
}

/** Bullet chart de orçamento: gasto vs teto, com marcador de meta. */
export function BulletBudget({
  spent,
  budget,
  color,
}: {
  spent: number;
  budget: number;
  color?: string;
}) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: pct > 100 ? "rgb(var(--negative))" : pct >= 80 ? "rgb(var(--warning))" : (color ?? "rgb(var(--accent))"),
        }}
      />
      <span className="absolute inset-y-0 right-0 w-px bg-fg/40" />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
