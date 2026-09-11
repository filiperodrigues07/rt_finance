import { useEffect, useState } from "react";
import { getPrefs, onPrefsChange } from "@/lib/preferences";
import { useTransactionMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { formatBRL } from "@/lib/format";
import { ApiError } from "@/lib/api";
import type { TransactionRow } from "@/lib/types";

/** Chips de um toque a partir dos atalhos salvos em Preferências → lançamento rápido. */
export function QuickAddChips({ className = "" }: { className?: string }) {
  const toast = useToast();
  const { quickAdd } = useTransactionMutations();
  const [tpls, setTpls] = useState(() => getPrefs().quickAddTemplates);
  useEffect(() => onPrefsChange(() => setTpls(getPrefs().quickAddTemplates)), []);

  if (!tpls.length) return null;

  async function fire(text: string) {
    try {
      const res = await quickAdd.mutateAsync(text);
      if (res.status === "created") {
        const t = res.transaction as TransactionRow;
        toast.success(`${t.type === "INCOME" ? "Receita" : "Despesa"} ${formatBRL(t.amountCents)} — ${t.description}`);
      } else if (res.status === "preview") {
        toast.info("Compra parcelada — confirme na tela de Transações.");
      } else {
        toast.info("Precisa de mais detalhes — abra em Transações.");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não consegui lançar");
    }
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {tpls.map((t, i) => (
        <button
          key={i}
          onClick={() => fire(t.text)}
          disabled={quickAdd.isPending}
          className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium hover:border-accent/50 hover:text-accent disabled:opacity-50"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
