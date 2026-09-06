import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Download, Trash2, UploadCloud } from "lucide-react";
import type { TransactionAttachmentDTO } from "@rt-finance/shared";
import { useAttachmentMutations, useAttachments } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/misc";

const KIND_LABEL: Record<string, string> = { BOLETO: "Boleto", RECEIPT: "Comprovante", OTHER: "Outro" };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Lista + upload de anexos (boleto/comprovante) de um lançamento. */
export function Attachments({
  transactionId,
  defaultKind = "BOLETO",
}: {
  transactionId: string;
  defaultKind?: "BOLETO" | "RECEIPT" | "OTHER";
}) {
  const toast = useToast();
  const { data, isLoading } = useAttachments(transactionId);
  const { upload, remove, download } = useAttachmentMutations(transactionId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"BOLETO" | "RECEIPT" | "OTHER">(defaultKind);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Arquivo muito grande — o limite é 5 MB.");
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    try {
      await upload.mutateAsync(form);
      toast.success("Anexo adicionado");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Falha ao anexar");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="label">Tipo</div>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "BOLETO", label: "Boleto" },
            { value: "RECEIPT", label: "Comprovante" },
            { value: "OTHER", label: "Outro" },
          ]}
          full
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-surface-2 px-4 py-4 text-sm transition-colors hover:border-accent">
        <UploadCloud className="size-5 text-muted" />
        <span className="text-muted">{upload.isPending ? "Enviando…" : "Escolher arquivo (PDF, PNG ou JPG)…"}</span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="hidden"
          disabled={upload.isPending}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : !data?.length ? (
        <p className="text-xs text-muted">Nenhum anexo ainda.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.map((a) => (
            <AttachmentRow key={a.id} att={a} onDownload={() => download.mutate(a)} onRemove={() => remove.mutate(a.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentRow({
  att,
  onDownload,
  onRemove,
}: {
  att: TransactionAttachmentDTO;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const isImg = att.mimeType.startsWith("image/");
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      {isImg ? <ImageIcon className="size-4 shrink-0 text-muted" /> : <FileText className="size-4 shrink-0 text-muted" />}
      <div className="min-w-0 flex-1">
        <div className="truncate">{att.fileName}</div>
        <div className="text-xs text-muted">
          {KIND_LABEL[att.kind] ?? att.kind} · {formatSize(att.sizeBytes)}
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onDownload} aria-label="Baixar">
        <Download className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Excluir">
        <Trash2 className="size-4 text-negative" />
      </Button>
    </li>
  );
}
