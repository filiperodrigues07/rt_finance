import { useState } from "react";
import { AlertTriangle, Copy, RotateCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "./Button";

/** Bloco de erro detalhado: mensagem + código + requestId copiável + corpo bruto. */
export function ErrorState({
  error,
  onRetry,
  title = "Algo deu errado",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const api = error instanceof ApiError ? error : null;
  const message = api?.message ?? (error instanceof Error ? error.message : String(error));
  const body = api?.body as
    | { error?: string; requestId?: string; statusCode?: number; path?: string }
    | undefined;

  const details = JSON.stringify(
    {
      message,
      code: body?.error,
      status: api?.status ?? body?.statusCode,
      requestId: body?.requestId,
      path: body?.path,
      raw: api?.body ?? (error instanceof Error ? error.stack : error),
    },
    null,
    2,
  );

  return (
    <div className="rounded-xl border border-negative/40 bg-negative/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-negative" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-fg">{title}</div>
          <p className="mt-0.5 break-words text-sm text-fg/80">{message}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {body?.error && <span>código: {body.error}</span>}
            {(api?.status ?? body?.statusCode) && <span>HTTP {api?.status ?? body?.statusCode}</span>}
            {body?.requestId && <span className="tnum">req: {body.requestId}</span>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCw className="size-3.5" /> Tentar de novo
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(details).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <Copy className="size-3.5" /> {copied ? "Copiado" : "Copiar detalhes"}
            </Button>
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted">detalhes técnicos</summary>
            <pre className="mt-1 max-h-52 overflow-auto rounded-md bg-surface-2 p-2 text-[11px] leading-snug text-muted">
              {details}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
