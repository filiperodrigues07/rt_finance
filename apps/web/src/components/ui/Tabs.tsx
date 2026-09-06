import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabDef {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
}

/** Abas com trilho inferior. Rola horizontalmente quando não couber (mobile). */
export function Tabs({
  value,
  onChange,
  tabs,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  tabs: TabDef[];
  className?: string;
}) {
  return (
    <div className={cn("relative border-b border-border", className)}>
      <div
        role="tablist"
        className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-accent text-fg"
                  : "border-transparent text-muted hover:text-fg",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
