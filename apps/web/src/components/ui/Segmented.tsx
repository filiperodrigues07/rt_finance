import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  full,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
  full?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex rounded-lg border border-border bg-surface-2 p-0.5",
        full && "flex w-full",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium transition-colors",
              size === "sm" ? "h-7 text-xs" : "h-9 text-sm",
              full ? "min-w-0 flex-1 px-2" : size === "sm" ? "px-2.5" : "px-3.5",
              active
                ? "bg-surface text-fg shadow-card"
                : "text-muted hover:text-fg",
            )}
          >
            <span className="shrink-0">{o.icon}</span>
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
