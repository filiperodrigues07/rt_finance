import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({
  trigger,
  items,
  align = "end",
  label,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  /** nome acessível quando o gatilho é só um ícone */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row = (it: MenuItem, i: number, size: "sm" | "lg") => (
    <button
      key={i}
      role="menuitem"
      disabled={it.disabled}
      onClick={() => {
        setOpen(false);
        it.onClick();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md text-left transition-colors",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "lg" ? "px-3 py-3 text-[15px]" : "px-2.5 py-1.5 text-sm",
        it.danger ? "text-negative hover:bg-negative/10" : "text-fg hover:bg-surface-2",
      )}
    >
      {it.icon}
      {it.label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {trigger}
      </button>

      {open && (
        <>
          {/* desktop: dropdown ancorado no gatilho */}
          <div
            role="menu"
            className={cn(
              "animate-pop absolute z-50 mt-1 hidden min-w-[11rem] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-pop sm:block",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {items.map((it, i) => row(it, i, "sm"))}
          </div>

          {/* mobile: action sheet fixo no rodapé */}
          {createPortal(
            <div className="fixed inset-0 z-[95] sm:hidden">
              <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
              <div
                role="menu"
                onMouseDown={(e) => e.stopPropagation()}
                className="animate-sheet-up absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-pop"
              >
                <div className="mx-auto mb-1.5 mt-1 h-1 w-9 rounded-full bg-border" />
                {label && (
                  <div className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted">
                    {label}
                  </div>
                )}
                {items.map((it, i) => row(it, i, "lg"))}
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
