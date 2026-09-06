import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-2">
      {/* painel de marca */}
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

      {/* formulário — centralizado */}
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="rounded-xl bg-[#0B0D12] px-4 py-3">
              <img src="/brand-logo.png" alt="RT Finance" className="h-10 w-auto" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
            <p className="mb-6 mt-1 text-sm text-muted">Bom te ver de novo.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="E-mail">
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                required
                autoFocus
              />
            </Field>
            <Field label="Senha" error={error ?? undefined}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            <Button type="submit" className="w-full" loading={loading}>
              Entrar
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
            >
              Esqueci a senha
            </button>
            {showHint && (
              <p className="mx-auto mt-2 max-w-xs text-xs text-muted">
                Sem redefinição por e-mail. Peça ao dono da conta para redefinir sua senha em
                <span className="text-fg"> Usuários → Redefinir senha</span>.
              </p>
            )}
          </div>

          <footer className="mt-10 text-center text-[11px] leading-relaxed text-muted">
            <p>© {new Date().getFullYear()} RT Finance. Todos os direitos reservados.</p>
            <p>Desenvolvido por Filipe Rodrigues</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
