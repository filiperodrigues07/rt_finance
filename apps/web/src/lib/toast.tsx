import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "./cn";
import { buzz } from "./haptics";

type Kind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
  leaving?: boolean;
}

const MAX_TOASTS = 4;

const ToastContext = createContext<{
  push: (kind: Kind, message: string) => void;
} | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const drop = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  /** marca como saindo (dispara a animação) e remove após ela terminar */
  const remove = useCallback(
    (id: number) => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      window.setTimeout(() => drop(id), 200);
    },
    [drop],
  );

  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = ++seq;
      buzz(kind === "error" ? "error" : kind === "success" ? "success" : "tap");
      setToasts((t) => [...t.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
      window.setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="pointer-events-none fixed right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
        style={{ top: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border border-l-2 bg-elevated p-3 text-sm shadow-pop",
              t.leaving ? "animate-toast-out" : "animate-pop",
              t.kind === "success" && "border-positive/30 border-l-positive",
              t.kind === "error" && "border-negative/30 border-l-negative",
              t.kind === "info" && "border-border border-l-accent",
            )}
          >
            {t.kind === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" />}
            {t.kind === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-negative" />}
            {t.kind === "info" && <Info className="mt-0.5 size-4 shrink-0 text-muted" />}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return {
    success: (m: string) => ctx.push("success", m),
    error: (m: string) => ctx.push("error", m),
    info: (m: string) => ctx.push("info", m),
  };
}
