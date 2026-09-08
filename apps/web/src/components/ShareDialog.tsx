import { useEffect, useState } from "react";
import { Download, Send } from "lucide-react";
import type { ShareKind } from "@rt-finance/shared";
import { useShareTargets, useShareMutations } from "@/lib/hooks";
import { download, saveBlob, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/misc";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: ShareKind;
  id?: string;
  range?: { from?: string; to?: string };
}

function pathFor(kind: ShareKind, id?: string, range?: Props["range"]): string {
  if (kind === "month") {
    const qs = new URLSearchParams();
    if (range?.from) qs.set("from", range.from);
    if (range?.to) qs.set("to", range.to);
    return `/share/month${qs.toString() ? `?${qs}` : ""}`;
  }
  return `/share/${kind}/${id}`;
}

const FILENAME: Record<ShareKind, string> = {
  transaction: "rt-finance-lancamento.png",
  month: "rt-finance-resumo-mes.png",
  invoice: "rt-finance-fatura.png",
};

export function ShareDialog({ open, onClose, kind, id, range }: Props) {
  const toast = useToast();
  const { data: targets, isLoading: loadingTargets } = useShareTargets();
  const { toWhatsapp } = useShareMutations();

  const [preview, setPreview] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState(false);
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let alive = true;
    setPreview(null);
    setPreviewErr(false);
    download(pathFor(kind, id, range))
      .then(({ blob }) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => alive && setPreviewErr(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, kind, id, range]);

  useEffect(() => {
    if (open && targets && !to) {
      setTo(targets.find((t) => t.hasPhone)?.id ?? targets[0]?.id ?? "");
    }
  }, [open, targets, to]);

  async function doDownload() {
    setDownloading(true);
    try {
      const { blob } = await download(pathFor(kind, id, range));
      saveBlob(blob, FILENAME[kind]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível gerar a imagem");
    } finally {
      setDownloading(false);
    }
  }

  async function doSend() {
    try {
      await toWhatsapp.mutateAsync({ kind, id, toMemberId: to, range });
      toast.success("Enviado no WhatsApp");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível enviar");
    }
  }

  const selected = targets?.find((t) => t.id === to);
  const canSend = Boolean(to) && (selected?.hasPhone ?? false);

  return (
    <Dialog open={open} onClose={onClose} title="Compartilhar">
      <div className="space-y-4 p-5">
        <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
          {previewErr ? (
            <div className="grid h-48 place-items-center text-sm text-muted">
              Não foi possível gerar a prévia
            </div>
          ) : preview ? (
            <img src={preview} alt="Prévia do card" className="mx-auto block max-h-72 w-auto" />
          ) : (
            <Skeleton className="h-48" />
          )}
        </div>

        <Field label="Enviar para">
          {loadingTargets ? (
            <Skeleton className="h-10" />
          ) : (
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {targets?.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.hasPhone}>
                  {t.displayName}
                  {t.hasPhone ? "" : " (sem WhatsApp)"}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button variant="ghost" onClick={doDownload} loading={downloading}>
          <Download className="size-4" /> Baixar imagem
        </Button>
        <Button onClick={doSend} loading={toWhatsapp.isPending} disabled={!canSend}>
          <Send className="size-4" /> Enviar no WhatsApp
        </Button>
      </div>
    </Dialog>
  );
}
