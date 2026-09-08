import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

/**
 * Tela de erro cheia e com a cara do app (404, boundary, etc.).
 * Por padrão oferece "Início" + "Recarregar"; passe `actions` para trocar.
 */
export function ErrorScreen({
  code,
  title,
  description,
  actions,
  details,
}: {
  code?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  details?: ReactNode;
}) {
  return (
    <div className="animate-in flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="relative flex flex-col items-center">
        {code && (
          <span
            aria-hidden
            className="tnum pointer-events-none absolute -top-10 select-none text-[8rem] font-bold leading-none text-fg/[0.05] sm:text-[10rem]"
          >
            {code}
          </span>
        )}
        <div className="relative mb-4 grid size-12 place-items-center rounded-full bg-accent/10 text-accent">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="relative text-lg font-semibold tracking-tight text-fg">{title}</h1>
        {description && (
          <p className="relative mt-1.5 max-w-sm text-sm text-muted">{description}</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {actions ?? (
          <>
            <Button size="sm" onClick={() => (window.location.href = "/")}>
              Voltar ao início
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </>
        )}
      </div>

      {details && <div className="mt-6 w-full max-w-lg text-left">{details}</div>}
    </div>
  );
}
