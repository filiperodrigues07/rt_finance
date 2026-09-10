import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { ACCENTS, type Accent } from "@rt-finance/shared";
import { getPrefs, onPrefsChange, patchPrefs } from "@/lib/preferences";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Segmented } from "@/components/ui/Segmented";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

const ACCENT_DOT: Record<Accent, string> = {
  blue: "#3b82f6",
  pink: "#ec4899",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#64748b",
};

const FONT = [
  { v: 0.9, label: "Pequena" },
  { v: 1, label: "Padrão" },
  { v: 1.1, label: "Grande" },
];

/** Aparência: acento, tema, tamanho da fonte e densidade — sincroniza entre dispositivos. */
export function AppearancePanel() {
  const [p, setP] = useState(getPrefs);
  useEffect(() => onPrefsChange(() => setP(getPrefs())), []);
  const t = p.theme;

  return (
    <CollapsibleCard
      id="appearance"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          <Monitor className="size-4 text-muted" /> Aparência
        </span>
      }
      description="Cor, tema, fonte e densidade — vale para todas as telas e sincroniza no seu login."
    >
      <div className="space-y-4">
        <Field label="Cor de destaque">
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a}
                aria-label={a}
                onClick={() => patchPrefs({ theme: { accent: a } })}
                className={cn(
                  "size-8 rounded-full ring-offset-2 ring-offset-bg transition",
                  t.accent === a ? "ring-2 ring-fg/60" : "ring-1 ring-border hover:ring-fg/30",
                )}
                style={{ background: ACCENT_DOT[a] }}
              />
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tema">
            <Segmented
              value={t.mode}
              onChange={(v) => patchPrefs({ theme: { mode: v } })}
              options={[
                { value: "light", label: "Claro" },
                { value: "dark", label: "Escuro" },
                { value: "system", label: "Sistema" },
              ]}
              full
            />
          </Field>

          <Field label="Densidade">
            <Segmented
              value={t.density}
              onChange={(v) => patchPrefs({ theme: { density: v } })}
              options={[
                { value: "cozy", label: "Confortável" },
                { value: "compact", label: "Compacto" },
              ]}
              full
            />
          </Field>
        </div>

        <Field label="Tamanho da fonte">
          <Segmented
            value={String(t.fontScale)}
            onChange={(v) => patchPrefs({ theme: { fontScale: Number(v) } })}
            options={FONT.map((f) => ({ value: String(f.v), label: f.label }))}
            full
          />
        </Field>
      </div>
    </CollapsibleCard>
  );
}
