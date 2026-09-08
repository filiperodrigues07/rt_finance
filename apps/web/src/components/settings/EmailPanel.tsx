import { useEffect, useState } from "react";
import { Mail, Send, CheckCircle2, XCircle } from "lucide-react";
import {
  useEmailPrefs,
  useEmailPrefsMutations,
  useAdminEmailSettings,
  useAdminEmailMutations,
} from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Badge, Skeleton } from "@/components/ui/misc";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: prefs, isLoading } = useEmailPrefs();
  const prefsMut = useEmailPrefsMutations();

  const isOwner = user?.role === "OWNER";
  const isAdmin = !!user?.isSuperAdmin;

  if (isLoading || !prefs) {
    return (
      <Card>
        <Skeleton className="h-40" />
      </Card>
    );
  }

  const statusBadge = prefs.emailReady ? (
    <Badge color="#22C55E">
      <CheckCircle2 className="size-3" /> E-mail ativo
    </Badge>
  ) : (
    <Badge color="#EF4444">
      <XCircle className="size-3" /> Sem SMTP
    </Badge>
  );

  async function toggleWeekly(next: boolean) {
    try {
      await prefsMut.save.mutateAsync({ weeklyEnabled: next });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");
    }
  }

  return (
    <CollapsibleCard
      id="email"
      title={
        <span className="flex items-center gap-2">
          <Mail className="size-4" /> E-mail
        </span>
      }
      description="Redefinição de senha e resumos semanais."
      action={statusBadge}
    >
      {isAdmin && <GlobalSmtpForm />}

      {isOwner ? (
        <div className={isAdmin ? "mt-4 border-t border-border pt-4" : ""}>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.weeklyEnabled}
              disabled={prefsMut.save.isPending}
              onChange={(e) => toggleWeekly(e.target.checked)}
              className="mt-0.5 size-4 accent-[rgb(var(--accent))]"
            />
            <span>
              Receber <strong>resumo semanal</strong> por e-mail (segunda de manhã, para todos do
              casal).
              {!prefs.emailReady && (
                <span className="block text-xs text-muted">
                  Precisa que o SMTP esteja configurado
                  {isAdmin ? " acima" : " pelo administrador"}.
                </span>
              )}
            </span>
          </label>
        </div>
      ) : (
        <p className="text-sm text-muted">Apenas o dono do household edita estas opções.</p>
      )}
    </CollapsibleCard>
  );
}

/** Formulário de SMTP GLOBAL — só o super-admin vê. */
function GlobalSmtpForm() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, isLoading } = useAdminEmailSettings();
  const { save, test } = useAdminEmailMutations();

  const [f, setF] = useState({
    smtpHost: "smtp.gmail.com",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    fromName: "RT Finance",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setF({
      smtpHost: data.smtpHost,
      smtpPort: String(data.smtpPort),
      smtpUser: data.smtpUser,
      smtpPass: "",
      fromName: data.fromName,
    });
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-56" />;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(f.smtpUser.trim())) return setError("Usuário SMTP precisa ser um e-mail válido.");
    const port = Number(f.smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return setError("Porta inválida.");
    try {
      await save.mutateAsync({
        smtpHost: f.smtpHost.trim(),
        smtpPort: port,
        smtpUser: f.smtpUser.trim(),
        smtpPass: f.smtpPass || undefined,
        fromName: f.fromName.trim(),
      });
      setF((p) => ({ ...p, smtpPass: "" }));
      toast.success("SMTP salvo (vale para todos os households)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar");
    }
  }

  async function onTest() {
    try {
      const r = await test.mutateAsync();
      if (r.ok) toast.success(`E-mail de teste enviado para ${user?.email}`);
      else toast.error(`Falhou: ${r.error ?? "erro desconhecido"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível testar");
    }
  }

  const badge = data.configured ? (
    <span className="text-xs text-positive">Configurado</span>
  ) : data.usingEnvFallback ? (
    <span className="text-xs text-warning">Usando SMTP do .env</span>
  ) : (
    <span className="text-xs text-negative">Não configurado</span>
  );

  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">SMTP do sistema (global)</span>
        {badge}
      </div>
      <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-xs text-muted">
        Um único remetente para todos os households. Para Gmail: ative a{" "}
        <strong>verificação em 2 etapas</strong> e gere uma <strong>Senha de app</strong>{" "}
        (myaccount.google.com → Segurança → Senhas de app). Use o código de 16 caracteres, sem
        espaços.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Servidor SMTP">
          <Input value={f.smtpHost} onChange={(e) => setF({ ...f, smtpHost: e.target.value })} />
        </Field>
        <Field label="Porta">
          <Input
            inputMode="numeric"
            value={f.smtpPort}
            onChange={(e) => setF({ ...f, smtpPort: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
      </div>
      <Field label="Usuário (e-mail)">
        <Input
          type="email"
          autoComplete="off"
          value={f.smtpUser}
          onChange={(e) => setF({ ...f, smtpUser: e.target.value })}
          placeholder="voce@gmail.com"
        />
      </Field>
      <Field
        label="Senha de app"
        hint={data.configured ? "Deixe em branco para manter a senha atual." : undefined}
        error={error ?? undefined}
      >
        <PasswordInput
          autoComplete="new-password"
          value={f.smtpPass}
          onChange={(e) => setF({ ...f, smtpPass: e.target.value })}
          placeholder={data.configured ? "•••••••••••••••• (mantém a atual)" : "16 caracteres"}
        />
      </Field>
      <Field label="Nome do remetente">
        <Input value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} />
      </Field>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" size="sm" loading={save.isPending}>
          Salvar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onTest}
          loading={test.isPending}
          disabled={save.isPending}
        >
          <Send className="size-4" /> Enviar e-mail de teste
        </Button>
      </div>
      <p className="text-xs text-muted">
        O teste vai para <strong>{user?.email}</strong>.
      </p>
    </form>
  );
}
