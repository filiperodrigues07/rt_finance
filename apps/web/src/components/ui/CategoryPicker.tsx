import { useMemo, useState } from "react";
import { ChevronsUpDown, Check, Tag } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sheet } from "./Sheet";
import { Input } from "./Field";
import type { Category } from "@/lib/types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Dot({ category, size = 24 }: { category?: Category | null; size?: number }) {
  if (!category) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"
        style={{ width: size, height: size }}
      >
        <Tag className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg"
      style={{ width: size, height: size, background: `${category.color}22`, fontSize: size * 0.5 }}
    >
      {category.icon}
    </span>
  );
}

/** Seletor de categoria: botão com a atual → abre um sheet com busca + lista rolável. */
export function CategoryPicker({
  value,
  onChange,
  categories,
  allowNone = true,
  placeholder = "Sem categoria",
}: {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  allowNone?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = categories.find((c) => c.id === value) ?? null;

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return categories;
    return categories.filter((c) => norm(c.name).includes(t));
  }, [q, categories]);

  function pick(id: string) {
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
        <Dot category={current} />
        <span className={cn("flex-1 truncate", !current && "text-muted")}>
          {current ? current.name : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Escolher categoria">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar categoria…"
          className="mb-3"
        />
        <ul className="space-y-1">
          {allowNone && (
            <li>
              <button
                type="button"
                onClick={() => pick("")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                  value === "" && "bg-surface-2",
                )}
              >
                <Dot category={null} size={28} />
                <span className="flex-1 text-muted">Sem categoria</span>
                {value === "" && <Check className="size-4 text-accent" />}
              </button>
            </li>
          )}
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => pick(c.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                  value === c.id && "bg-surface-2",
                )}
              >
                <Dot category={c} size={28} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {value === c.id && <Check className="size-4 shrink-0 text-accent" />}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted">Nenhuma categoria encontrada.</li>
          )}
        </ul>
      </Sheet>
    </>
  );
}
