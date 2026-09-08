import { useState } from "react";
import { Send, Trash2, Pencil, Check, X } from "lucide-react";
import { useComments, useCommentMutations } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/misc";
import type { TransactionCommentDTO } from "@rt-finance/shared";

/** Conversa do casal em cima de um lançamento. */
export function Comments({ transactionId }: { transactionId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, isLoading } = useComments(transactionId);
  const { add, edit, remove } = useCommentMutations(transactionId);
  const [draft, setDraft] = useState("");

  async function send() {
    const body = draft.trim();
    if (!body) return;
    try {
      await add.mutateAsync(body);
      setDraft("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível comentar");
    }
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !data?.length ? (
        <p className="text-sm text-muted">
          Sem comentários. Pergunte ou explique algo sobre esse lançamento — o outro recebe no
          WhatsApp e no sino.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((c) => (
            <CommentBubble
              key={c.id}
              c={c}
              mine={c.author.id === user?.memberId}
              onSave={(body) => edit.mutateAsync({ id: c.id, body })}
              onDelete={() => remove.mutate(c.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escrever um comentário…"
          rows={2}
          className="min-h-[42px]"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <Button size="icon" onClick={send} loading={add.isPending} aria-label="Enviar comentário">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function CommentBubble({
  c,
  mine,
  onSave,
  onDelete,
}: {
  c: TransactionCommentDTO;
  mine: boolean;
  onSave: (body: string) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.body);
  return (
    <li className="flex gap-2.5">
      <Avatar name={c.author.displayName} src={c.author.avatarUrl} color={c.author.color} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className="font-medium text-fg">{c.author.displayName}</span>
          <span>· {timeAgo(c.createdAt)}</span>
          {c.editedAt && <span>· editado</span>}
        </div>
        {editing ? (
          <div className="mt-1 flex items-end gap-1.5">
            <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={2} className="min-h-[40px]" />
            <Button
              size="icon"
              aria-label="Salvar"
              onClick={async () => {
                if (val.trim()) await onSave(val.trim());
                setEditing(false);
              }}
            >
              <Check className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Cancelar" onClick={() => { setVal(c.body); setEditing(false); }}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
        )}
      </div>
      {mine && !editing && (
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Excluir" onClick={onDelete}>
            <Trash2 className="size-3.5 text-negative" />
          </Button>
        </div>
      )}
    </li>
  );
}
