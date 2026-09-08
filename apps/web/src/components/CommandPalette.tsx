import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useTransactions } from "@/lib/hooks";
import { formatBRL, formatDate } from "@/lib/format";
import { NAV } from "./layout/nav";

interface Cmd {
  label: string;
  to: string;
  keywords?: string;
}

type Item =
  | { kind: "nav"; to: string; label: string }
  | { kind: "tx"; to: string; label: string; sub: string };

const COMBINING = /[̀-ͯ]/g;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(COMBINING, "");

/** Paleta de comandos (Ctrl / Cmd + K) — busca e pula para qualquer tela. */
export function CommandPalette() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const base: Cmd[] = NAV.filter((n) => !n.admin || user?.isSuperAdmin).map((n) => ({
      label: n.label,
      to: n.to,
    }));
    return [
      ...base,
      { label: "Contas", to: "/carteira?tab=contas", keywords: "carteira banco saldo" },
      { label: "Cartões", to: "/carteira?tab=cartoes", keywords: "carteira fatura credito" },
      { label: "Recorrências", to: "/carteira?tab=recorrencias", keywords: "carteira fixa assinatura" },
      { label: "Orçamentos", to: "/carteira?tab=orcamentos", keywords: "carteira limite categoria" },
      { label: "Categorias", to: "/carteira?tab=categorias", keywords: "tag etiqueta" },
    ];
  }, [user?.isSuperAdmin]);

  const navResults = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return commands;
    return commands.filter((c) => norm(c.label + " " + (c.keywords ?? "")).includes(term));
  }, [q, commands]);

  // busca de transações (debounce simples)
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const txSearch = useTransactions(
    { search: dq, pageSize: 6 },
    { enabled: open && dq.length >= 2 },
  );

  const results = useMemo<Item[]>(() => {
    const nav: Item[] = navResults.map((c) => ({ kind: "nav", to: c.to, label: c.label }));
    const txs: Item[] = (txSearch.data?.data ?? []).map((t) => ({
      kind: "tx",
      to: `/transacoes?search=${encodeURIComponent(t.description)}`,
      label: t.description,
      sub: `${formatDate(t.date)} · ${formatBRL(t.amountCents)}`,
    }));
    return [...nav, ...txs];
  }, [navResults, txSearch.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("rt:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("rt:cmdk", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  function go(item: Item) {
    setOpen(false);
    navigate(item.to);
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="animate-pop relative z-10 -mt-[8vh] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter" && results[sel]) {
                go(results[sel]);
              }
            }}
            placeholder="Ir para… ou buscar um lançamento"
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {txSearch.isFetching ? "Buscando…" : "Nada encontrado"}
            </li>
          )}
          {results.map((c, i) => (
            <li key={`${c.kind}:${c.to}:${i}`}>
              <button
                onMouseEnter={() => setSel(i)}
                onClick={() => go(c)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  i === sel ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {c.kind === "tx" && <ArrowLeftRight className="size-3.5 shrink-0 opacity-60" />}
                <span className="min-w-0 flex-1 truncate">
                  {c.label}
                  {c.kind === "tx" && <span className="ml-2 text-xs text-muted">{c.sub}</span>}
                </span>
                {i === sel && <CornerDownLeft className="size-3.5 shrink-0 opacity-60" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
