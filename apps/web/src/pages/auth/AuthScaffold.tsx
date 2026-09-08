import type { ReactNode } from "react";

/** Moldura das telas de autenticação: painel de marca à esquerda, conteúdo centralizado à direita. */
export function AuthScaffold({
  title,
  subtitle,
  children,
  footerSlot,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footerSlot?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-[#0B0D12] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 15%, rgb(var(--accent)) 0, transparent 42%), radial-gradient(circle at 85% 80%, rgb(var(--accent)) 0, transparent 38%)",
          }}
        />
        <img src="/brand-logo.png" alt="RT Finance" className="relative h-12 w-auto self-start" />
        <div className="relative max-w-sm">
          <p className="font-display text-[30px] leading-tight text-white">
            Toda a vida financeira do casal, num só lugar.
          </p>
          <p className="mt-3 text-sm text-white/60">
            Registre e consulte pelo WhatsApp. Acompanhe tudo no painel.
          </p>
        </div>
        <p className="relative text-xs text-white/40">RT Finance · assistente do casal</p>
      </aside>

      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="rounded-xl bg-[#0B0D12] px-4 py-3">
              <img src="/brand-logo.png" alt="RT Finance" className="h-10 w-auto" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>}
          </div>

          {children}

          {footerSlot}

          <footer className="mt-10 text-center text-[11px] leading-relaxed text-muted">
            <p>© {new Date().getFullYear()} RT Finance. Todos os direitos reservados.</p>
            <p>Desenvolvido por Filipe Rodrigues</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
