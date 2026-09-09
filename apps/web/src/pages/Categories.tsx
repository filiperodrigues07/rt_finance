import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import type { CategoryKind } from "@rt-finance/shared";
import { useCategories, useCategoryMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/data";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Category } from "@/lib/types";

const EMOJIS = ["🛒", "🍔", "🚗", "🏠", "💡", "💳", "🎮", "👕", "💊", "📱", "📚", "✈️", "🔌", "💰", "💵", "📦", "🐶", "🎁", "☕", "🏥", "⚽", "💇"];
const COLORS = ["#22C55E", "#F97316", "#3B82F6", "#8B5CF6", "#EAB308", "#EC4899", "#06B6D4", "#F43F5E", "#10B981", "#6366F1", "#64748B", "#94A3B8"];
const KIND_LABEL: Record<CategoryKind, string> = { EXPENSE: "Despesa", INCOME: "Receita", BOTH: "Ambos" };

export function CategoriesPage() {
  const toast = useToast();
  const { data, isLoading } = useCategories();
  const { remove } = useCategoryMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categorias"
        subtitle={`${(data ?? []).length} categoria${(data ?? []).length === 1 ? "" : "s"} do casal`}
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="size-4" /> Nova categoria
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((c) => (
            <Card key={c.id} className="flex items-center gap-3 p-3">
              <span className="grid size-9 place-items-center rounded-lg text-lg" style={{ background: `${c.color}22` }}>
                {c.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted">{KIND_LABEL[c.kind]}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" title="Editar categoria" aria-label="Editar categoria" onClick={() => { setEditing(c); setFormOpen(true); }}>
                  <Pencil className="size-4" />
                </Button>
                {c.isSystem ? (
                  <span className="grid size-10 place-items-center text-muted" title="Categoria do sistema" aria-label="Categoria do sistema">
                    <Lock className="size-3.5" />
                  </span>
                ) : (
                  <Button variant="ghost" size="icon" title="Remover categoria" aria-label="Remover categoria" onClick={() => setToDelete(c)}>
                    <Trash2 className="size-4 text-negative" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CategoryForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
            toast.success("Categoria removida");
            setToDelete(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Erro");
          }
        }}
        title="Remover categoria"
        message={`Remover "${toDelete?.name}"? Se estiver em uso, será arquivada.`}
        confirmLabel="Remover"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}

function CategoryForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Category | null;
}) {
  const toast = useToast();
  const { create, update } = useCategoryMutations();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState(COLORS[0]!);
  const [kind, setKind] = useState<CategoryKind>("EXPENSE");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? "📦");
    setColor(editing?.color ?? COLORS[0]!);
    setKind(editing?.kind ?? "EXPENSE");
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome");
    try {
      const body = { name: name.trim(), icon, color, kind };
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      toast.success("Categoria salva");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Editar categoria" : "Nova categoria"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button form="cat-form" type="submit" loading={create.isPending || update.isPending}>Salvar</Button>
        </>
      }
    >
      <form id="cat-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome" error={error ?? undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pets" autoFocus />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)} disabled={editing?.isSystem}>
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
            <option value="BOTH">Ambos</option>
          </Select>
        </Field>
        <div>
          <span className="label">Ícone</span>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                className={`grid size-9 place-items-center rounded-lg text-lg ${icon === e ? "bg-accent/15 ring-1 ring-accent" : "bg-surface-2"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Cor</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-8 rounded-full ${color === c ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
