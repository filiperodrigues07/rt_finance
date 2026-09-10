import { Scale } from "lucide-react";
import { useHouseholdFeatures, useHouseholdFeaturesMutation } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";

/** Recursos opcionais do household (só o dono liga/desliga). */
export function FeaturesPanel() {
  const toast = useToast();
  const { data } = useHouseholdFeatures();
  const save = useHouseholdFeaturesMutation();

  async function setSettleUp(on: boolean) {
    try {
      await save.mutateAsync({ settleUp: on });
      toast.success(on ? "Acerto do casal ativado" : "Acerto do casal desativado");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não deu certo");
    }
  }

  return (
    <CollapsibleCard
      id="features"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          <Scale className="size-4 text-muted" /> Recursos
        </span>
      }
      description="Funcionalidades extras que nem todo casal usa."
    >
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={data?.settleUp ?? false}
          onChange={(e) => setSettleUp(e.target.checked)}
          className="mt-0.5 size-4 accent-[rgb(var(--accent))]"
        />
        <span>
          <span className="font-medium">Acerto do casal</span>
          <span className="block text-xs text-muted">
            Mostra quem pagou mais no período e registra a transferência de acerto. Adiciona a tela
            "Acerto" no menu.
          </span>
        </span>
      </label>
    </CollapsibleCard>
  );
}
