import { useEffect, useState } from "react";
import { ArrowUpDown, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/cn";

export type ViewMode = "grid" | "list";
export interface SortOption<S extends string> {
  value: S;
  label: string;
}

/** Preferências de ordenação + visualização de uma lista, persistidas em localStorage. */
export function useListPrefs<S extends string>(key: string, defaultSort: S) {
  const sk = `rt-${key}-sort`;
  const vk = `rt-${key}-view`;
  const [sort, setSortState] = useState<S>(() => {
    try {
      return (localStorage.getItem(sk) as S) || defaultSort;
    } catch {
      return defaultSort;
    }
  });
  const [view, setViewState] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(vk) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(sk, sort);
    } catch {
      /* ignore */
    }
  }, [sk, sort]);
  useEffect(() => {
    try {
      localStorage.setItem(vk, view);
    } catch {
      /* ignore */
    }
  }, [vk, view]);
  return { sort, setSort: setSortState, view, setView: setViewState };
}

export function ListToolbar<S extends string>({
  sort,
  setSort,
  sortOptions,
  view,
  setView,
}: {
  sort: S;
  setSort: (s: S) => void;
  sortOptions: SortOption<S>[];
  view: ViewMode;
  setView: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <ArrowUpDown className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as S)}
          aria-label="Ordenar por"
          className="input h-8 w-auto appearance-none py-0 pl-7 pr-7 text-xs"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
        {(
          [
            ["grid", LayoutGrid, "Grade"],
            ["list", List, "Lista"],
          ] as const
        ).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            aria-label={label}
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={cn(
              "grid size-7 place-items-center rounded-[7px] transition-colors",
              view === v ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
