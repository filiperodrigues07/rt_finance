import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "./cn";

type Kind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<{
  push: (kind: Kind, message: string) => void;
} | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = ++seq;
      setToasts((t) => [...t, { id, kind, message }]);
      window.setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-in pointer-events-auto flex items-start gap-2 rounded-xl border bg-surface p-3 text-sm shadow-card",
              t.kind === "success" && "border-positive/40",
              t.kind === "error" && "border-negative/40",
              t.kind === "info" && "border-border",
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
