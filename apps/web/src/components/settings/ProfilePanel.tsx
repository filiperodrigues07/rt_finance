import { useEffect, useRef, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Edição do próprio perfil (foto, nome, e-mail, telefone) + troca de senha. */
export function ProfilePanel() {
  const { refreshUser } = useAuth();
  const toast = useToast();
  const { data: profile, isLoading } = useProfile();
  const { updateProfile, changePassword } = useHouseholdMutations();

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
    if (!EMAIL_RE.test(mail)) return setProfileError("E-mail inválido");
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
    <>
      <Card>
        <CardHeader title="Meu perfil" description="Seus dados de acesso e identificação." />
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <form onSubmit={saveProfile} className="space-y-3">
            <div className="flex items-center gap-4">
              <Avatar
                name={profile?.name ?? name}
                src={profile?.avatarUrl}
                color={profile?.avatarColor}
                size={64}
              />
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
            <Field
              label="Telefone (WhatsApp, E.164)"
              hint="Ex.: +5511999999999 — usado para identificar você no WhatsApp"
            >
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
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Nova senha" error={pwError ?? undefined}>
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Button type="submit" size="sm" loading={changePassword.isPending}>
            Alterar senha
          </Button>
        </form>
      </Card>
    </>
  );
}
