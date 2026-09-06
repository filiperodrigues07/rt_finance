import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import type { ImportRowDTO } from "@rt-finance/shared";
import { useCategories, useHousehold, useImport, useImportMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Badge, Skeleton } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/data";

const SOURCE_LABEL: Record<string, string> = {
  OFX_BANK: "Extrato de conta (OFX)",
  OFX_CARD: "Fatura de cartão (OFX)",
  PDF_BANK: "Extrato de conta (PDF)",
  PDF_CARD: "Fatura de cartão (PDF)",
};

export function ImportReviewPage() {
  useEffect(() => {
    document.title = "Revisar importação · RT Finance";
  }, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading } = useImport(id);
  const categories = useCategories();
  const household = useHousehold();
  const { patchRow, commit, discard } = useImportMutations();

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState("");

  const members = household.data?.members ?? [];
  const rows = data?.rows ?? [];
  const review = rows.filter((r) => !r.transactionId && (r.state === "NEEDS_REVIEW" || r.state === "DUPLICATE"));
  const done = rows.filter((r) => r.transactionId);

  const included = review.filter((r) => !excluded.has(r.id));
  const includedTotal = included.reduce(
    (s, r) => s + (r.type === "EXPENSE" ? -r.amountCents : r.amountCents),
    0,
  );

  const catFor = (type: "EXPENSE" | "INCOME") =>
    (categories.data ?? []).filter((c) => !c.archivedAt && (c.kind === type || c.kind === "BOTH"));

  function toggle(rowId: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(rowId) ? next.delete(rowId) : next.add(rowId);
      return next;
    });
  }

  async function setCategory(row: ImportRowDTO, categoryId: string) {
    try {
      await patchRow.mutateAsync({ batchId: id!, rowId: row.id, body: { categoryId: categoryId || null } });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar");
    }
  }
  async function setMember(row: ImportRowDTO, memberId: string) {
    try {
      await patchRow.mutateAsync({ batchId: id!, rowId: row.id, body: { memberId } });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar");
    }
  }

  async function applyBulkCategory() {
    if (!bulkCat) return;
    await Promise.all(
      included
        .filter((r) => catFor(r.type).some((c) => c.id === bulkCat))
        .map((r) => patchRow.mutateAsync({ batchId: id!, rowId: r.id, body: { categoryId: bulkCat } })),
    );
    setBulkCat("");
  }

  function ignoreDuplicates() {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const r of review) if (r.state === "DUPLICATE") next.add(r.id);
      return next;
    });
  }

  async function confirmImport() {
    try {
      // marca os excluídos como ignorados e importa o restante
      await Promise.all(
        [...excluded].map((rowId) =>
          patchRow.mutateAsync({ batchId: id!, rowId, body: { state: "SKIPPED" } }),
        ),
      );
      const res = await commit.mutateAsync({ batchId: id! });
      toast.success(`${res.committed} lançamento(s) importado(s)`);
      navigate("/transacoes");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Falha ao importar");
    }
  }

  async function onDiscard() {
    if (!confirm("Descartar esta importação? Os lançamentos já importados são mantidos.")) return;
    await discard.mutateAsync(id!);
    navigate("/transacoes");
  }

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return <p className="text-sm text-muted">Importação não encontrada.</p>;

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Revisar importação"
        subtitle={`${SOURCE_LABEL[data.source] ?? data.source} · ${data.fileName}`}
        actions={
          <Button variant="ghost" size="sm" onClick={onDiscard} loading={discard.isPending}>
            Descartar
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Lançamentos" value={String(data.rowCount)} />
        <Mini label="Automáticos" value={String(done.length)} />
        <Mini label="A revisar" value={String(review.length)} />
        <Mini label="Duplicatas" value={String(review.filter((r) => r.state === "DUPLICATE").length)} />
      </div>

      {review.length > 0 && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Select
              value={bulkCat}
              onChange={(e) => setBulkCat(e.target.value)}
              className="h-8 w-auto text-xs"
            >
              <option value="">Definir categoria…</option>
              {(categories.data ?? [])
                .filter((c) => !c.archivedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            <Button size="sm" variant="outline" onClick={applyBulkCategory} disabled={!bulkCat}>
              Aplicar aos incluídos
            </Button>
            {review.some((r) => r.state === "DUPLICATE") && (
              <Button size="sm" variant="ghost" onClick={ignoreDuplicates}>
                Ignorar duplicatas
              </Button>
            )}
          </div>

          <ul className="divide-y divide-border">
            {review.map((row) => {
              const isIn = !excluded.has(row.id);
              return (
                <li
                  key={row.id}
                  className={cnRow(isIn)}
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isIn}
                      onChange={() => toggle(row.id)}
                      className="size-4 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-fg">{row.description}</span>
                        {row.state === "DUPLICATE" && (
                          <Badge className="shrink-0 bg-warning/15 text-warning">
                            <AlertTriangle className="size-3" /> duplicata
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted">
                        {row.postedDate.split("-").reverse().join("/")}
                      </span>
                    </div>
                    <span
                      className={
                        "tnum shrink-0 text-sm " +
                        (row.type === "EXPENSE" ? "text-negative" : "text-positive")
                      }
                    >
                      {row.type === "EXPENSE" ? "−" : "+"}
                      {formatBRL(row.amountCents)}
                    </span>
                  </label>

                  <div className="mt-2 flex flex-wrap gap-2 pl-7">
                    <div className="flex items-center gap-1">
                      <Select
                        value={row.categoryId ?? ""}
                        onChange={(e) => setCategory(row, e.target.value)}
                        className="h-8 w-auto text-xs"
                      >
                        <option value="">Sem categoria</option>
                        {catFor(row.type).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      {row.categoryId && row.categoryId === row.suggestedCategoryId && (
                        <Badge className="bg-accent/15 text-accent">
                          <Sparkles className="size-3" /> IA
                        </Badge>
                      )}
                    </div>
                    <Select
                      value={row.memberId ?? ""}
                      onChange={(e) => setMember(row, e.target.value)}
                      className="h-8 w-auto text-xs"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </Select>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {done.length > 0 && (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm text-muted">
            Já importados automaticamente ({done.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {done.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Check className="size-4 shrink-0 text-positive" />
                <span className="min-w-0 flex-1 truncate">{row.description}</span>
                <span className="text-xs text-muted">{row.categoryName ?? "—"}</span>
                <span
                  className={
                    "tnum shrink-0 " + (row.type === "EXPENSE" ? "text-negative" : "text-positive")
                  }
                >
                  {row.type === "EXPENSE" ? "−" : "+"}
                  {formatBRL(row.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {review.length === 0 && done.length > 0 && (
        <p className="text-sm text-muted">
          Tudo importado automaticamente. Nada para revisar.{" "}
          <button className="text-accent underline" onClick={() => navigate("/transacoes")}>
            Ver transações
          </button>
        </p>
      )}

      {review.length > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-14 z-40 border-t border-border bg-surface/95 p-3 backdrop-blur lg:bottom-0 lg:pl-[260px]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm text-muted">
              {included.length} de {review.length} · {formatBRL(includedTotal)}
            </span>
            <Button onClick={confirmImport} loading={commit.isPending || patchRow.isPending}>
              Importar {included.length} lançamento{included.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function cnRow(included: boolean): string {
  return "p-3 transition-opacity " + (included ? "" : "opacity-45");
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum text-lg font-semibold tracking-tight text-fg">{value}</div>
    </div>
  );
}
