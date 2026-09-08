import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/** Bottom-sheet (mobile). No desktop vira um painel centralizado. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-sheet-up relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-pop",
          "sm:max-w-md sm:rounded-2xl sm:animate-pop",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border sm:hidden" />
        <div className="flex items-center justify-between px-5 py-3">
          {title ? (
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-1">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5 pb-safe">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
