import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Copy, Check, List, LayoutGrid, Upload, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHousehold, useHouseholdMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { fileToAvatarDataUri } from "@/lib/image";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/data";
import { cn } from "@/lib/cn";
import type { Member } from "@/lib/types";

const COLORS = ["#7A6A55", "#3B82F6", "#EC4899", "#22C55E", "#F97316", "#8B5CF6", "#06B6D4"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIEW_KEY = "rt-users-view";

export function UsersPage() {
  const { user } = useAuth();
  const { data, isLoading } = useHousehold();
  const isOwner = user?.role === "OWNER";
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [editHousehold, setEditHousehold] = useState(false);
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  function setViewPersist(v: "grid" | "list") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

  const members = data?.members ?? [];
  const canEdit = (m: Member) => isOwner || m.user.id === user?.id;

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Conta do casal — ambos veem os mesmos dados"
        actions={
          isOwner && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Novo usuário
            </Button>
          )
        }
      />

      <Card className="mb-4">
        {isLoading ? (
          <Skeleton className="h-6 w-52" />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-sm">
              <span className="text-muted">Household</span> ·{" "}
              <strong className="break-words">{data?.name}</strong>{" "}
              <span className="text-muted">
                · {data?.timezone} · {data?.currency}
              </span>
            </div>
            {isOwner && (
              <Button
                variant="ghost"
                size="icon"
                title="Editar household"
                aria-label="Editar household"
                onClick={() => setEditHousehold(true)}
              >
                <Pencil className="size-4" />
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Membros</h2>
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
          {(
            [
              ["grid", LayoutGrid, "Grade"],
              ["list", List, "Lista"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-label={label}
              aria-pressed={view === v}
              onClick={() => setViewPersist(v)}
              className={cn(
                "grid size-7 place-items-center rounded-[7px] transition-colors",
                view === v ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className={view === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-2"}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className={view === "grid" ? "h-24" : "h-16"} />
          ))}
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <MemberTile key={m.id} m={m} onClick={canEdit(m) ? () => setEditing(m) : undefined} />
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-border p-0">
          {members.map((m) => (
            <MemberRow key={m.id} m={m} onClick={canEdit(m) ? () => setEditing(m) : undefined} />
          ))}
        </Card>
      )}

      <UserDialog member={editing} onClose={() => setEditing(null)} isOwner={isOwner} />
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <HouseholdDialog
        open={editHousehold}
        onClose={() => setEditHousehold(false)}
        current={data ? { name: data.name, timezone: data.timezone, currency: data.currency } : null}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: Member["role"] }) {
  return <Badge>{role === "OWNER" ? "Dono" : "Membro"}</Badge>;
}

function MemberTile({ m, onClick }: { m: Member; onClick?: () => void }) {
  return (
    <Card
      className={cn(
        "flex items-center gap-3 p-4 text-left",
        onClick && "card-hover cursor-pointer hover:bg-surface-2",
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <Avatar name={m.displayName} src={m.user.avatarUrl} color={m.color} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{m.displayName}</span>
          <RoleBadge role={m.role} />
        </div>
        <div className="truncate text-xs text-muted">{m.user.email}</div>
        <div className="truncate text-xs text-muted">{m.user.phoneE164 ?? "sem telefone"}</div>
      </div>
      {onClick && <Pencil className="size-4 shrink-0 text-muted" />}
    </Card>
  );
}

function MemberRow({ m, onClick }: { m: Member; onClick?: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        onClick && "cursor-pointer transition-colors hover:bg-surface-2",
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <Avatar name={m.displayName} src={m.user.avatarUrl} color={m.color} size={32} />
      <span className="w-32 shrink-0 truncate text-sm font-medium">{m.displayName}</span>
      <RoleBadge role={m.role} />
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted sm:block">
        {m.user.email}
      </span>
      <span className="hidden shrink-0 text-xs text-muted md:block">
        {m.user.phoneE164 ?? "sem telefone"}
      </span>
      {onClick && <Pencil className="ml-auto size-4 shrink-0 text-muted sm:ml-0" />}
    </div>
  );
}

/**
 * Tudo do usuário num lugar só: dados, cor, papel e senha. Ninguém edita nada
 * fora daqui. Editando a si mesmo usa /me/profile + troca a própria senha;
 * o dono editando outro usa /household/members/:id + redefine a senha (temporária).
 */
function UserDialog({
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
    setPhone(member.user.phoneE164 ?? "");
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
    try {
      if (isSelf) {
        await updateMember.mutateAsync({ id: member.id, body: { displayName: displayName.trim(), color } });
        await updateProfile.mutateAsync({
          name: fullName.trim() || displayName.trim(),
          email: mail,
          phoneE164: phone.trim() || null,
        });
        await refreshUser();
      } else {
        await updateMember.mutateAsync({
          id: member.id,
          body: {
            displayName: displayName.trim(),
            color,
            ...(mail !== member.user.email ? { email: mail } : {}),
            ...(phone.trim() !== (member.user.phoneE164 ?? "")
              ? { phoneE164: phone.trim() || null }
              : {}),
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
    if (newPw.length < 8) return setPwError("A nova senha precisa de ao menos 8 caracteres");
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
          label="Telefone (WhatsApp, E.164)"
          hint="Ex.: +5511999999999 — quem pode falar com o bot"
        >
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55..." />
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
              <Input
                type="password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="Nova senha" error={pwError ?? undefined}>
              <Input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={changePassword.isPending}
              onClick={doChangePassword}
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

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { createMember } = useHouseholdMutations();
  const [f, setF] = useState({
    name: "",
    email: "",
    password: "",
    displayName: "",
    color: COLORS[0]!,
    role: "MEMBER" as "OWNER" | "MEMBER",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setF({ name: "", email: "", password: "", displayName: "", color: COLORS[0]!, role: "MEMBER" });
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password.length < 8) return setError("Senha inicial: mínimo 8 caracteres");
    try {
      await createMember.mutateAsync({
        name: f.name.trim(),
        email: f.email.trim(),
        password: f.password,
        displayName: (f.displayName || f.name).trim(),
        color: f.color,
        role: f.role,
      });
      toast.success("Usuário criado");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao criar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Novo usuário"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="create-user" type="submit" loading={createMember.isPending}>
            Criar
          </Button>
        </>
      }
    >
      <form id="create-user" onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Exibição">
            <Input
              value={f.displayName}
              onChange={(e) => setF({ ...f, displayName: e.target.value })}
              placeholder={f.name || "como aparece"}
            />
          </Field>
        </div>
        <Field label="E-mail">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Senha inicial" error={error ?? undefined}>
          <Input
            type="text"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            placeholder="mín. 8 caracteres"
          />
        </Field>
        <Field label="Papel">
          <Select
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value as "OWNER" | "MEMBER" })}
          >
            <option value="MEMBER">Membro</option>
            <option value="OWNER">Dono</option>
          </Select>
        </Field>
        <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
      </form>
    </Dialog>
  );
}

function HouseholdDialog({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: { name: string; timezone: string; currency: string } | null;
}) {
  const toast = useToast();
  const { updateHousehold } = useHouseholdMutations();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !current) return;
    setName(current.name);
    setTimezone(current.timezone);
    setCurrency(current.currency);
    setError(null);
  }, [open, current]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome");
    try {
      await updateHousehold.mutateAsync({
        name: name.trim(),
        timezone: timezone.trim() || undefined,
        currency: currency.trim().toUpperCase() || undefined,
      });
      toast.success("Household atualizado");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Editar household"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="household-form" type="submit" loading={updateHousehold.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="household-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome" error={error ?? undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fuso horário">
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Sao_Paulo"
            />
          </Field>
          <Field label="Moeda">
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="BRL"
              maxLength={3}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
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
