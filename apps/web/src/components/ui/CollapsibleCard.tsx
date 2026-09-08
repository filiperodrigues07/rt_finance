import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Card com cabeçalho clicável que recolhe/expande o conteúdo. Lembra o estado por `id`. */
export function CollapsibleCard({
  id,
  title,
  description,
  action,
  defaultOpen = true,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const key = `rt-collapse:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });

  function toggle() {
    setOpen((o) => {
      const n = !o;
      try {
        localStorage.setItem(key, n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  }

  return (
    <div className={cn("card p-0", className)}>
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">{title}</span>
            {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
          </span>
        </button>
        {action}
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
