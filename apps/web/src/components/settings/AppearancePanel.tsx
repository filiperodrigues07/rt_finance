import { Monitor } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useDensity } from "@/lib/useDensity";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Segmented } from "@/components/ui/Segmented";
import { Field } from "@/components/ui/Field";

/** Aparência: tema e densidade da interface (aplicam no app todo). */
export function AppearancePanel() {
  const { pref, setPref } = useTheme();
  const { dense, setDense } = useDensity();

  return (
    <CollapsibleCard
      id="appearance"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          <Monitor className="size-4 text-muted" /> Aparência
        </span>
      }
      description="Tema e densidade — vale para todas as telas."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tema">
          <Segmented
            value={pref}
            onChange={setPref}
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
            value={dense ? "compact" : "cozy"}
            onChange={(v) => setDense(v === "compact")}
            options={[
              { value: "cozy", label: "Confortável" },
              { value: "compact", label: "Compacto" },
            ]}
            full
          />
        </Field>
      </div>
    </CollapsibleCard>
  );
}
