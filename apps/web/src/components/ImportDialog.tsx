import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Image as ImageIcon, UploadCloud } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAccounts, useCreditCards, useImportMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";

export function ImportDialog({
  open,
  onClose,
  defaultKind = "BANK",
  defaultTargetId,
  defaultTargetName,
  lockTarget = false,
}: {
  open: boolean;
  onClose: () => void;
  defaultKind?: "BANK" | "CARD";
  defaultTargetId?: string;
  /** nome já pronto do cartão/conta travado — evita esperar a lista carregar. */
  defaultTargetName?: string;
  /** true = abre já travado no cartão/conta (chamado de dentro do próprio cartão/conta). */
  lockTarget?: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const accounts = useAccounts();
  const cards = useCreditCards();
  const { create } = useImportMutations();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<"BANK" | "CARD">(defaultKind);
  const [targetId, setTargetId] = useState(defaultTargetId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = kind === "BANK" ? (accounts.data ?? []) : (cards.data ?? []);
  const target = useMemo(() => targetId || (options[0]?.id ?? ""), [targetId, options]);
  const targetLabel =
    defaultTargetName ?? options.find((o) => o.id === target)?.name ?? "";

  const ext = file?.name.toLowerCase().split(".").pop() ?? "";
  const isImage = ["png", "jpg", "jpeg"].includes(ext);
  const isPdf = ext === "pdf";

  async function submit() {
    setError(null);
    if (!target) return setError("Selecione a conta ou o cartão.");
    if (!file) return setError("Escolha um arquivo .ofx, .pdf, .png ou .jpg.");

    const form = new FormData();
    form.set("kind", kind);
    form.set(kind === "BANK" ? "accountId" : "creditCardId", target);
    form.set("file", file);

    try {
      const batch = await create.mutateAsync(form);
      if (batch.status === "REVIEW") {
        navigate(`/importar/${batch.id}`);
      } else {
        toast.success(
          `${batch.committedCount} lançamento(s) importado(s)` +
            (batch.autoCount ? " automaticamente" : ""),
        );
      }
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao importar o arquivo.");
    }
  }

  function reset() {
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Importar extrato ou fatura"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {create.isPending ? "Lendo arquivo…" : "Importar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {lockTarget ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
            <span className="text-muted">{kind === "BANK" ? "Extrato de" : "Fatura de"} </span>
            <span className="font-medium text-fg">{targetLabel || "…"}</span>
          </div>
        ) : (
          <>
            <Field label="O que é este arquivo?">
              <Segmented
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  setTargetId("");
                }}
                options={[
                  { value: "BANK", label: "Extrato de conta" },
                  { value: "CARD", label: "Fatura de cartão" },
                ]}
                full
              />
            </Field>
            <Field label={kind === "BANK" ? "Conta" : "Cartão"}>
              <Select value={target} onChange={(e) => setTargetId(e.target.value)}>
                {options.length === 0 && <option value="">Nenhum cadastrado</option>}
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <Field
          label="Arquivo"
          hint={
            isImage
              ? "Foto/print: o texto é lido no servidor (OCR local) e depois interpretado pela IA."
              : isPdf
                ? "PDF: o texto é enviado para a IA extrair os lançamentos."
                : "OFX é lido localmente. Aceita .ofx, .pdf, .png e .jpg (até 15 MB)."
          }
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-surface-2 px-4 py-4 text-sm transition-colors hover:border-accent">
            {file ? (
              isImage ? (
                <ImageIcon className="size-5 text-accent" />
              ) : (
                <FileText className="size-5 text-accent" />
              )
            ) : (
              <UploadCloud className="size-5 text-muted" />
            )}
            <span className={file ? "text-fg" : "text-muted"}>
              {file ? file.name : "Escolher arquivo…"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".ofx,.pdf,.png,.jpg,.jpeg,application/pdf,application/x-ofx,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </label>
        </Field>

        {error && <p className="text-xs text-negative">{error}</p>}
        {create.isPending && (isPdf || isImage) && (
          <p className="text-xs text-muted">
            {isImage ? "Fotos podem levar até ~1 min pro OCR + IA." : "Faturas grandes podem levar até ~30 s para processar."}
          </p>
        )}
      </div>
    </Dialog>
  );
}
