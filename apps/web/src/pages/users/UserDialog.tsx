import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHouseholdMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { fileToAvatarDataUri } from "@/lib/image";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { PasswordInput, PasswordRules } from "@/components/ui/PasswordInput";
import { Avatar } from "@/components/ui/Avatar";
import { checkPassword, isValidPhoneBR, maskPhoneBR, toE164BR } from "@rt-finance/shared";
import type { Member } from "@/lib/types";

export const COLORS = ["#7A6A55", "#3B82F6", "#EC4899", "#22C55E", "#F97316", "#8B5CF6", "#06B6D4"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tudo do usuário num lugar só: dados, cor, papel e senha. Ninguém edita nada
 * fora daqui. Editando a si mesmo usa /me/profile + troca a própria senha;
 * o dono editando outro usa /household/members/:id + redefine a senha (temporária).
 */
export function UserDialog({
  member,
  onClose,
  isOwner,
}: {
  member: Member | null;
  onClose: () => void;
  isOwner: boolean;
}) {
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const { updateMember, updateProfile, changePassword, resetMemberPassword } =
    useHouseholdMutations();

  const isSelf = !!member && member.user.id === user?.id;

  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [role, setRole] = useState<"OWNER" | "MEMBER">("MEMBER");
  const [error, setError] = useState<string | null>(null);

  // senha (self)
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  // senha (owner redefine a de outro)
  const [temp, setTemp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // avatar (self)
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!member) return;
    setDisplayName(member.displayName);
    setFullName(member.user.name);
    setEmail(member.user.email);
    setPhone(member.user.phoneE164 ? maskPhoneBR(member.user.phoneE164) : "");
    setColor(member.color);
    setRole(member.role);
    setError(null);
    setCurPw("");
    setNewPw("");
    setPwError(null);
    setTemp(null);
    setCopied(false);
  }, [member]);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await updateProfile.mutateAsync({ avatarUrl: await fileToAvatarDataUri(file) });
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

  async function saveData(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setError(null);
    if (!displayName.trim()) return setError("Informe o nome de exibição");
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return setError("E-mail inválido");
    if (phone.trim() && !isValidPhoneBR(phone)) return setError("Telefone incompleto");
    // manda em E.164; a API normaliza de novo, então os dois lados batem
    const newPhone = phone.trim() ? toE164BR(phone) : null;
    try {
      if (isSelf) {
        await updateMember.mutateAsync({ id: member.id, body: { displayName: displayName.trim(), color } });
        await updateProfile.mutateAsync({
          name: fullName.trim() || displayName.trim(),
          email: mail,
          phoneE164: newPhone,
        });
        await refreshUser();
      } else {
        await updateMember.mutateAsync({
          id: member.id,
          body: {
            displayName: displayName.trim(),
            color,
            ...(mail !== member.user.email ? { email: mail } : {}),
            ...(newPhone !== (member.user.phoneE164 ?? null) ? { phoneE164: newPhone } : {}),
            ...(isOwner ? { role } : {}),
          },
        });
      }
      toast.success("Usuário atualizado");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  async function doChangePassword() {
    setPwError(null);
    if (!checkPassword(newPw).ok) {
      return setPwError("A nova senha não cumpre todos os requisitos abaixo.");
    }
    try {
      await changePassword.mutateAsync({ currentPassword: curPw, newPassword: newPw });
      toast.success("Senha alterada. Faça login de novo nos outros aparelhos.");
      setCurPw("");
      setNewPw("");
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Erro ao alterar senha");
    }
  }

  async function doReset() {
    if (!member) return;
    try {
      const r = await resetMemberPassword.mutateAsync(member.id);
      setTemp(r.tempPassword);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro");
    }
  }

  return (
    <Dialog
      open={!!member}
      onClose={onClose}
      title={isSelf ? "Meu perfil" : "Editar usuário"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            form="user-form"
            type="submit"
            loading={updateMember.isPending || updateProfile.isPending}
          >
            Salvar
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={saveData} className="space-y-4">
        {isSelf && (
          <div className="flex items-center gap-4">
            <Avatar
              name={member?.displayName ?? ""}
              src={member?.user.avatarUrl}
              color={color}
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
              {member?.user.avatarUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={removeAvatar}>
                  <Trash2 className="size-4" /> Remover
                </Button>
              )}
            </div>
          </div>
        )}

        <Field label="Nome de exibição" error={error ?? undefined}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </Field>
        {isSelf && (
          <Field label="Nome completo">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
        )}
        <Field label="E-mail (login)" hint="Ao salvar, o próximo login já é com o novo e-mail.">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field
          label="Telefone (WhatsApp)"
          hint="Quem pode falar com o bot. Digite do jeito que preferir — o formato é ajustado sozinho."
          error={phone.trim() && !isValidPhoneBR(phone) ? "Número incompleto" : undefined}
        >
          <Input
            value={phone}
            onChange={(e) => setPhone(maskPhoneBR(e.target.value))}
            placeholder="(49) 99964-8444"
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        {isOwner && !isSelf && (
          <Field label="Papel">
            <Select value={role} onChange={(e) => setRole(e.target.value as "OWNER" | "MEMBER")}>
              <option value="OWNER">Dono</option>
              <option value="MEMBER">Membro</option>
            </Select>
          </Field>
        )}
        <ColorPicker value={color} onChange={setColor} />
      </form>

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 text-sm font-medium">Senha</div>
        {isSelf ? (
          <div className="space-y-3">
            <Field label="Senha atual">
              <PasswordInput
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="Nova senha" error={pwError ?? undefined}>
              <PasswordInput
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
              {newPw.length > 0 && <PasswordRules value={newPw} />}
            </Field>
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={changePassword.isPending}
              onClick={doChangePassword}
              disabled={!checkPassword(newPw).ok || curPw.length === 0}
            >
              Alterar senha
            </Button>
          </div>
        ) : temp ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Senha temporária gerada. As sessões desse usuário foram encerradas. Anote agora — não
              aparece de novo.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3">
              <code className="tnum flex-1 text-base tracking-wide">{temp}</code>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copiar senha"
                onClick={() => {
                  navigator.clipboard?.writeText(temp);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4 text-positive" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Gera uma senha nova para <strong>{member?.displayName}</strong> e desconecta essa
              pessoa de todos os aparelhos.
            </p>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={resetMemberPassword.isPending}
              onClick={doReset}
            >
              Redefinir senha
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <span className="label">Cor</span>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`size-8 rounded-full transition ${value === c ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
            style={{ background: c }}
            aria-label={`cor ${c}`}
          />
        ))}
      </div>
    </div>
  );
}
