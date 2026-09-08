import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile, useHouseholdMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { fileToAvatarDataUri } from "@/lib/image";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/data";
import { WhatsAppPanel } from "@/components/settings/WhatsAppPanel";

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: profile, isLoading } = useProfile();
  const { updateProfile, changePassword, resetData } = useHouseholdMutations();

  const [dngConfirm, setDngConfirm] = useState("");
  const [dngPwd, setDngPwd] = useState("");
  const [dngAccounts, setDngAccounts] = useState(false);
  const [dngCards, setDngCards] = useState(false);
  const [dngCategories, setDngCategories] = useState(false);
  const [dngErr, setDngErr] = useState<string | null>(null);

  async function wipeData(e: React.FormEvent) {
    e.preventDefault();
    setDngErr(null);
    try {
      const r = await resetData.mutateAsync({
        confirm: "LIMPAR",
        password: dngPwd,
        alsoAccounts: dngAccounts,
        alsoCards: dngCards,
        alsoCategories: dngCategories,
      });
      toast.success(`Dados limpos: ${r.cleared.join(", ")}`);
      navigate("/");
    } catch (err) {
      setDngErr(err instanceof ApiError ? err.message : "Não foi possível limpar");
    }
  }

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setEmail(profile.email);
      setPhone(profile.phoneE164 ?? "");
    }
  }, [profile]);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const avatarUrl = await fileToAvatarDataUri(file);
      await updateProfile.mutateAsync({ avatarUrl });
      await refreshUser();
      toast.success("Foto atualizada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não consegui processar a imagem");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    await updateProfile.mutateAsync({ avatarUrl: null });
    await refreshUser();
    toast.success("Foto removida");
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      return setProfileError("E-mail inválido");
    }
    try {
      await updateProfile.mutateAsync({
        name: name.trim(),
        email: mail,
        phoneE164: phone.trim() || null,
      });
      await refreshUser();
      toast.success("Perfil atualizado");
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (next.length < 8) return setPwError("A nova senha precisa de ao menos 8 caracteres");
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      toast.success("Senha alterada. Faça login novamente nos outros dispositivos.");
      setCurrent("");
      setNext("");
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Erro ao alterar senha");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Configurações" />

      <p className="text-sm text-muted">
        Tema (modo e cor) agora fica no menu do seu perfil — clique na sua foto no canto
        inferior esquerdo.
      </p>

      <Card>
        <CardHeader title="Perfil" />
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <form onSubmit={saveProfile} className="space-y-3">
            <div className="flex items-center gap-4">
              <Avatar name={profile?.name ?? name} src={profile?.avatarUrl} color={profile?.avatarColor} size={64} />
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" /> Enviar foto
                </Button>
                {profile?.avatarUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={removeAvatar}>
                    <Trash2 className="size-4" /> Remover
                  </Button>
                )}
              </div>
            </div>
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field
              label="E-mail"
              hint="É o que você usa para entrar. Ao salvar, o próximo login já é com o novo e-mail."
              error={profileError ?? undefined}
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Telefone (WhatsApp, E.164)" hint="Ex.: +5511999999999 — usado para identificar você no WhatsApp">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55..." />
            </Field>
            <Button type="submit" size="sm" loading={updateProfile.isPending}>
              Salvar perfil
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader title="Senha" description="Alterar a senha desconecta os outros dispositivos." />
        <form onSubmit={savePassword} className="space-y-3">
          <Field label="Senha atual">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="Nova senha" error={pwError ?? undefined}>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button type="submit" size="sm" loading={changePassword.isPending}>
            Alterar senha
          </Button>
        </form>
      </Card>

      <WhatsAppPanel />

      {user?.role === "OWNER" && (
        <Card className="border-negative/40">
          <CardHeader
            title={
              <span className="flex items-center gap-2 text-negative">
                <AlertTriangle className="size-4" /> Zona de perigo
              </span>
            }
            description="Limpar dados para começar a usar de verdade. Isto NÃO tem volta."
          />
          <form onSubmit={wipeData} className="space-y-3">
            <p className="text-sm text-muted">
              Sempre apaga o <strong className="text-fg">histórico</strong>: lançamentos, parcelas,
              faturas, recorrências, metas, orçamentos, importações, anexos, notificações e conversas
              do bot. Marque abaixo o que também quer apagar:
            </p>
            <div className="space-y-2 text-sm">
              {[
                ["contas", dngAccounts, setDngAccounts] as const,
                ["cartões", dngCards, setDngCards] as const,
                ["categorias (recria as padrão)", dngCategories, setDngCategories] as const,
              ].map(([label, val, set]) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="size-4 accent-[rgb(var(--negative))]"
                  />
                  Também apagar {label}
                </label>
              ))}
            </div>
            <Field label='Digite LIMPAR para confirmar'>
              <Input
                value={dngConfirm}
                onChange={(e) => setDngConfirm(e.target.value)}
                placeholder="LIMPAR"
                autoComplete="off"
              />
            </Field>
            <Field label="Sua senha" error={dngErr ?? undefined}>
              <Input
                type="password"
                value={dngPwd}
                onChange={(e) => setDngPwd(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Button
              type="submit"
              size="sm"
              variant="danger"
              loading={resetData.isPending}
              disabled={dngConfirm !== "LIMPAR" || !dngPwd}
            >
              <Trash2 className="size-4" /> Limpar dados
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
