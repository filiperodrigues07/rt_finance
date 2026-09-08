import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Copy, Rows3, Rows4 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAdminHouseholds, useAdminMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useDensity } from "@/lib/useDensity";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/data";
import type { AdminHouseholdRow } from "@rt-finance/shared";

export function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, isLoading } = useAdminHouseholds();
  const { create, update, remove } = useAdminMutations();
  const { dense, toggle: toggleDensity } = useDensity();
  const [newOpen, setNewOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminHouseholdRow | null>(null);
  const [toEdit, setToEdit] = useState<AdminHouseholdRow | null>(null);
  const [delName, setDelName] = useState("");

  if (user && !user.isSuperAdmin) return <Navigate to="/" replace />;

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync({ id: toDelete.id, confirmName: delName });
      toast.success("Household excluído");
      setToDelete(null);
      setDelName("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erro ao excluir");
    }
  }

  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Households da plataforma — dados de cada casal são isolados."
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleDensity}
              title={dense ? "Linhas confortáveis" : "Linhas compactas"}
              aria-label="Densidade da tabela"
            >
              {dense ? <Rows3 className="size-4" /> : <Rows4 className="size-4" />}
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> Novo household
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState title="Nenhum household" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className={cn("w-full text-sm", dense && "table-dense")}>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Household</th>
                <th className="px-4 py-3 text-center font-medium">Membros</th>
                <th className="px-4 py-3 text-center font-medium">Lançamentos</th>
                <th className="px-4 py-3 text-left font-medium">WhatsApp</th>
                <th className="px-4 py-3 text-left font-medium">Criado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((h) => (
                <tr key={h.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{h.name}</div>
                    <div className="text-xs text-muted">
                      {h.timezone}
                      {h.isMine && <span className="ml-1 text-accent">· seu</span>}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-center">{h.memberCount}</td>
                  <td className="tnum px-4 py-3 text-center">{h.transactionCount}</td>
                  <td className="px-4 py-3">
                    {h.whatsappInstance ? (
                      <Badge>{h.whatsappInstance}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-muted">
                    {formatDate(h.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToEdit(h)}
                        title="Editar household"
                        aria-label="Editar household"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {!h.isMine && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setToDelete(h);
                            setDelName("");
                          }}
                          title="Excluir household"
                          aria-label="Excluir household"
                        >
                          <Trash2 className="size-4 text-negative" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NewHouseholdDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(email) => {
          toast.success(`Household criado. Login do dono: ${email}`);
          setNewOpen(false);
        }}
        pending={create.isPending}
        create={create.mutateAsync}
      />

      <EditHouseholdDialog
        row={toEdit}
        onClose={() => setToEdit(null)}
        pending={update.isPending}
        save={(body) =>
          update.mutateAsync({ id: toEdit!.id, body }).then(() => {
            toast.success("Household atualizado");
            setToEdit(null);
          })
        }
      />

      <Dialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Excluir household"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              loading={remove.isPending}
              disabled={delName.trim() !== toDelete?.name}
            >
              Excluir tudo
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Isso apaga <strong className="text-fg">todos os dados</strong> de{" "}
          <strong className="text-fg">{toDelete?.name}</strong> (lançamentos, contas, cartões,
          usuários…). Não tem volta.
        </p>
        <Field label={`Digite "${toDelete?.name}" para confirmar`}>
          <Input value={delName} onChange={(e) => setDelName(e.target.value)} autoComplete="off" />
        </Field>
      </Dialog>
    </div>
  );
}

function NewHouseholdDialog({
  open,
  onClose,
  onCreated,
  pending,
  create,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ownerEmail: string) => void;
  pending: boolean;
  create: (b: {
    householdName: string;
    timezone?: string;
    owner: { name: string; email: string; password: string };
    partner?: { name: string; email: string; password: string };
  }) => Promise<{ id: string; ownerEmail: string }>;
}) {
  const [hh, setHh] = useState("");
  const [tz, setTz] = useState("America/Sao_Paulo");
  const [oName, setOName] = useState("");
  const [oEmail, setOEmail] = useState("");
  const [oPwd, setOPwd] = useState("");
  const [withPartner, setWithPartner] = useState(false);
  const [pName, setPName] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pPwd, setPPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setHh("");
    setTz("America/Sao_Paulo");
    setOName("");
    setOEmail("");
    setOPwd("");
    setWithPartner(false);
    setPName("");
    setPEmail("");
    setPPwd("");
    setErr(null);
  }

  async function submit() {
    setErr(null);
    if (!hh.trim() || !oName.trim() || !oEmail.trim() || oPwd.length < 8) {
      return setErr("Preencha o nome do household e os dados do dono (senha ≥ 8).");
    }
    if (withPartner && (!pName.trim() || !pEmail.trim() || pPwd.length < 8)) {
      return setErr("Complete os dados do parceiro(a) ou desmarque a opção.");
    }
    try {
      const res = await create({
        householdName: hh.trim(),
        timezone: tz.trim() || undefined,
        owner: { name: oName.trim(), email: oEmail.trim(), password: oPwd },
        partner: withPartner
          ? { name: pName.trim(), email: pEmail.trim(), password: pPwd }
          : undefined,
      });
      reset();
      onCreated(res.ownerEmail);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Não foi possível criar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Novo household"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Criar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome do household">
            <Input value={hh} onChange={(e) => setHh(e.target.value)} placeholder="Casa Silva" />
          </Field>
          <Field label="Fuso horário">
            <Input value={tz} onChange={(e) => setTz(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Dono</div>
          <div className="space-y-2">
            <Input value={oName} onChange={(e) => setOName(e.target.value)} placeholder="Nome" />
            <Input
              type="email"
              value={oEmail}
              onChange={(e) => setOEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
            <Input
              type="password"
              value={oPwd}
              onChange={(e) => setOPwd(e.target.value)}
              placeholder="Senha inicial (≥ 8)"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withPartner}
            onChange={(e) => setWithPartner(e.target.checked)}
            className="size-4 accent-[rgb(var(--accent))]"
          />
          Adicionar parceiro(a) agora
        </label>

        {withPartner && (
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Parceiro(a)
            </div>
            <div className="space-y-2">
              <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Nome" />
              <Input
                type="email"
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
              <Input
                type="password"
                value={pPwd}
                onChange={(e) => setPPwd(e.target.value)}
                placeholder="Senha inicial (≥ 8)"
              />
            </div>
          </div>
        )}

        {err && <p className="text-xs text-negative">{err}</p>}
        <p className="text-xs text-muted">
          O dono entra com esse e-mail/senha e depois ajusta tudo. O número de WhatsApp é pareado
          por ele em Configurações → WhatsApp.
        </p>
      </div>
    </Dialog>
  );
}

/** O super-admin edita qualquer household (nome + fuso). Donos comuns não veem esta tela. */
function EditHouseholdDialog({
  row,
  onClose,
  pending,
  save,
}: {
  row: AdminHouseholdRow | null;
  onClose: () => void;
  pending: boolean;
  save: (body: { name?: string; timezone?: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [tz, setTz] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setName(row.name);
    setTz(row.timezone);
    setErr(null);
  }, [row]);

  async function submit() {
    setErr(null);
    if (!name.trim()) return setErr("Informe o nome");
    try {
      await save({ name: name.trim(), timezone: tz.trim() || undefined });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Não foi possível salvar");
    }
  }

  return (
    <Dialog
      open={!!row}
      onClose={onClose}
      title={`Editar ${row?.name ?? "household"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {row?.isMine && (
          <p className="text-xs text-muted">
            Este é o seu household. Você também edita ele em <strong>Usuários</strong>.
          </p>
        )}
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        </Field>
        <Field label="Fuso horário" error={err ?? undefined}>
          <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/Sao_Paulo" />
        </Field>
      </div>
    </Dialog>
  );
}
