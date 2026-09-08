import { useMemo, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { BANKS } from "@rt-finance/shared";
import { cn } from "@/lib/cn";
import { BankBadge } from "./BankBadge";
import { Sheet } from "./Sheet";
import { Input } from "./Field";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Seletor de banco: botão com o badge atual → abre um sheet com busca + grade. */
export function BankPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = BANKS.find((b) => b.id === value) ?? null;

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return BANKS;
    return BANKS.filter((b) => norm(`${b.name} ${b.code}`).includes(t));
  }, [q]);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="input flex w-full items-center gap-2 text-left"
      >
        <BankBadge id={value} size={24} />
        <span className="flex-1 truncate">
          {current ? current.name : "Sem banco"}
          {current?.code ? <span className="ml-1 text-muted">· {current.code}</span> : null}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Escolher banco">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar banco ou código…"
          className="mb-3"
        />
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li>
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                value == null && "bg-surface-2",
              )}
            >
              <BankBadge id={null} size={28} />
              <span className="flex-1">Sem banco</span>
              {value == null && <Check className="size-4 text-accent" />}
            </button>
          </li>
          {results.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => pick(b.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                  value === b.id && "bg-surface-2",
                )}
              >
                <BankBadge id={b.id} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{b.name}</span>
                  {b.code ? <span className="text-xs text-muted">Código {b.code}</span> : null}
                </span>
                {value === b.id && <Check className="size-4 shrink-0 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
