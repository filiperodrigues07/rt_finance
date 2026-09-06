import { useEffect, useState } from "react";
import { Pencil, Plus, KeyRound, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHousehold, useHouseholdMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/data";
import type { Member } from "@/lib/types";

const COLORS = ["#7A6A55", "#3B82F6", "#EC4899", "#22C55E", "#F97316", "#8B5CF6", "#06B6D4"];

export function UsersPage() {
  const { user } = useAuth();
  const { data, isLoading } = useHousehold();
  const isOwner = user?.role === "OWNER";
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [editHousehold, setEditHousehold] = useState(false);

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

      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          : (data?.members ?? []).map((m) => (
              <Card key={m.id} className="flex items-center gap-3 p-4">
                <Avatar name={m.displayName} src={m.user.avatarUrl} color={m.color} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.displayName}</span>
                    <Badge>{m.role === "OWNER" ? "Dono" : "Membro"}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted">{m.user.email}</div>
                  <div className="text-xs text-muted">{m.user.phoneE164 ?? "sem telefone"}</div>
                </div>
                {isOwner && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Redefinir senha"
                      onClick={() => setResetting(m)}
                    >
                      <KeyRound className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditing(m)}>
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                )}
              </Card>
            ))}
      </div>

      <MemberDialog member={editing} onClose={() => setEditing(null)} canSetRole={isOwner} />
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <ResetDialog member={resetting} onClose={() => setResetting(null)} />
      <HouseholdDialog
        open={editHousehold}
        onClose={() => setEditHousehold(false)}
        current={
          data
            ? { name: data.name, timezone: data.timezone, currency: data.currency }
            : null
        }
      />
    </div>
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

function MemberDialog({
  member,
  onClose,
  canSetRole,
}: {
  member: Member | null;
  onClose: () => void;
  canSetRole: boolean;
}) {
  const toast = useToast();
  const { updateMember } = useHouseholdMutations();
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [role, setRole] = useState<"OWNER" | "MEMBER">("MEMBER");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member) return;
    setDisplayName(member.displayName);
    setColor(member.color);
    setRole(member.role);
    setError(null);
  }, [member]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    try {
      await updateMember.mutateAsync({
        id: member.id,
        body: { displayName: displayName.trim(), color, ...(canSetRole ? { role } : {}) },
      });
      toast.success("Membro atualizado");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro");
    }
  }

  return (
    <Dialog
      open={!!member}
      onClose={onClose}
      title="Editar membro"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="member-form" type="submit" loading={updateMember.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome de exibição" error={error ?? undefined}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </Field>
        {canSetRole && (
          <Field label="Papel">
            <Select value={role} onChange={(e) => setRole(e.target.value as "OWNER" | "MEMBER")}>
              <option value="OWNER">Dono</option>
              <option value="MEMBER">Membro</option>
            </Select>
          </Field>
        )}
        <ColorPicker value={color} onChange={setColor} />
      </form>
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

function ResetDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const toast = useToast();
  const { resetMemberPassword } = useHouseholdMutations();
  const [temp, setTemp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!member) {
      setTemp(null);
      setCopied(false);
    }
  }, [member]);

  async function doReset() {
    if (!member) return;
    try {
      const r = await resetMemberPassword.mutateAsync(member.id);
      setTemp(r.tempPassword);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro");
      onClose();
    }
  }

  return (
    <Dialog
      open={!!member}
      onClose={onClose}
      title={`Redefinir senha — ${member?.displayName ?? ""}`}
      footer={
        temp ? (
          <Button onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={doReset} loading={resetMemberPassword.isPending}>
              Redefinir
            </Button>
          </>
        )
      }
    >
      {temp ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Senha temporária gerada. As sessões desse usuário foram encerradas. Anote agora — não
            será mostrada de novo.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3">
            <code className="tnum flex-1 text-base tracking-wide">{temp}</code>
            <Button
              variant="ghost"
              size="icon"
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
        <p className="text-sm text-muted">
          Isso gera uma nova senha para <strong>{member?.displayName}</strong> e desconecta essa
          pessoa de todos os dispositivos.
        </p>
      )}
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
