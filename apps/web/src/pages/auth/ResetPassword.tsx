import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { checkPassword } from "@rt-finance/shared";
import { ApiError, checkResetToken, resetPassword } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PasswordInput, PasswordRules } from "@/components/ui/PasswordInput";
import { Spinner } from "@/components/ui/misc";
import { AuthScaffold } from "./AuthScaffold";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const toast = useToast();

  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    let alive = true;
    checkResetToken(token)
      .then((r) => alive && setTokenState(r.valid ? "valid" : "invalid"))
      .catch(() => alive && setTokenState("invalid"));
    return () => {
      alive = false;
    };
  }, [token]);

  const strong = checkPassword(pw).ok;
  const mismatch = confirm.length > 0 && confirm !== pw;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!strong) return setError("A senha não cumpre todos os requisitos.");
    if (pw !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    try {
      await resetPassword(token, pw);
      setDone(true);
      toast.success("Senha redefinida. Faça login com a nova senha.");
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível redefinir a senha.");
      if (err instanceof ApiError && err.status === 422) setTokenState("invalid");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="Nova senha"
      subtitle={
        tokenState === "valid" && !done ? "Escolha uma senha forte para a sua conta." : undefined
      }
      footerSlot={
        <div className="mt-4 text-center">
          <Link
            to="/login"
            className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Voltar para o login
          </Link>
        </div>
      }
    >
      {tokenState === "checking" && (
        <div className="grid place-items-center py-8">
          <Spinner className="size-6" />
        </div>
      )}

      {tokenState === "invalid" && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-4 text-center text-sm">
          <p>Este link é inválido ou já expirou.</p>
          <Link
            to="/esqueci-senha"
            className="mt-3 inline-block font-medium text-accent underline-offset-2 hover:underline"
          >
            Pedir um novo link
          </Link>
        </div>
      )}

      {tokenState === "valid" &&
        (done ? (
          <div className="rounded-xl border border-border bg-surface-2/50 p-4 text-center">
            <CheckCircle2 className="mx-auto size-8 text-positive" />
            <p className="mt-2 text-sm">Senha redefinida! Redirecionando para o login…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nova senha">
              <PasswordInput
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
              />
              <PasswordRules value={pw} />
            </Field>
            <Field
              label="Confirmar senha"
              error={mismatch ? "As senhas não conferem" : (error ?? undefined)}
            >
              <PasswordInput
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              disabled={!strong || pw !== confirm}
            >
              Redefinir senha
            </Button>
          </form>
        ))}
    </AuthScaffold>
  );
}
