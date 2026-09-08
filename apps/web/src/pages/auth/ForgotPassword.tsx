import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import { forgotPassword } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { AuthScaffold } from "./AuthScaffold";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailInvalid = touched && !EMAIL_RE.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!EMAIL_RE.test(email.trim())) return;
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      // resposta é genérica de propósito; mostra o mesmo estado de sucesso
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="Redefinir senha"
      subtitle={sent ? undefined : "Enviamos um link para o seu e-mail."}
      footerSlot={
        <div className="mt-4 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar para o login
          </Link>
        </div>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-border bg-surface-2/50 p-4 text-center">
          <MailCheck className="mx-auto size-8 text-positive" />
          <p className="mt-2 text-sm">
            Se existir uma conta para <span className="font-medium text-fg">{email.trim()}</span>,
            enviamos um link para redefinir a senha.
          </p>
          <p className="mt-1 text-xs text-muted">Verifique também a caixa de spam. O link vale por 45 minutos.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="E-mail"
            error={emailInvalid ? "Informe um e-mail válido" : undefined}
          >
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="voce@exemplo.com"
              required
              autoFocus
            />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthScaffold>
  );
}
