import { useEffect, useState } from "react";
import { Pencil, Plus, List, LayoutGrid } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHousehold, useHouseholdMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { PasswordInput, PasswordRules } from "@/components/ui/PasswordInput";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/data";
import { cn } from "@/lib/cn";
import { checkPassword, formatPhoneBR } from "@rt-finance/shared";
import type { Member } from "@/lib/types";
import { UserDialog, ColorPicker, COLORS } from "./users/UserDialog";

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
        <div className="truncate text-xs text-muted">{m.user.phoneE164 ? formatPhoneBR(m.user.phoneE164) : "sem telefone"}</div>
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
        {m.user.phoneE164 ? formatPhoneBR(m.user.phoneE164) : "sem telefone"}
      </span>
      {onClick && <Pencil className="ml-auto size-4 shrink-0 text-muted sm:ml-0" />}
    </div>
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
    if (!checkPassword(f.password).ok) {
      return setError("A senha inicial não cumpre todos os requisitos.");
    }
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
        <div className="grid gap-3 sm:grid-cols-2">
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
          <PasswordInput
            defaultVisible
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            placeholder="mín. 8 caract., c/ maiúscula, número e especial"
          />
          {f.password.length > 0 && <PasswordRules value={f.password} />}
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
        <div className="grid gap-3 sm:grid-cols-2">
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
