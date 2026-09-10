import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  disablePush,
  enablePush,
  pushIsSubscribed,
  pushPermission,
  pushSupported,
} from "@/lib/push";
import { useToast } from "@/lib/toast";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Button } from "@/components/ui/Button";

/** Notificações push neste dispositivo (comentários, faturas, orçamentos, resumo). */
export function PushPanel() {
  const toast = useToast();
  const [supported] = useState(pushSupported);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (supported) void pushIsSubscribed().then(setSubscribed);
  }, [supported]);

  async function toggle() {
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
        toast.success("Notificações desativadas neste dispositivo");
      } else {
        await enablePush();
        setSubscribed(true);
        toast.success("Notificações ativadas 🔔");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo");
    } finally {
      setBusy(false);
    }
  }

  const denied = pushPermission() === "denied";

  return (
    <CollapsibleCard
      id="push"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          <Bell className="size-4 text-muted" /> Notificações no dispositivo
        </span>
      }
      description="Receba alertas mesmo com o app fechado (comentários, fatura vencendo, orçamento estourado)."
    >
      {!supported ? (
        <p className="text-sm text-muted">
          Este navegador não suporta. No iPhone, adicione o app à tela inicial e abra por lá.
        </p>
      ) : denied ? (
        <p className="text-sm text-muted">
          As notificações estão bloqueadas nas configurações do navegador/sistema para este site.
          Libere lá e volte aqui.
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <Button size="sm" variant={subscribed ? "outline" : "primary"} loading={busy} onClick={toggle}>
            {subscribed ? "Desativar" : "Ativar notificações"}
          </Button>
          <span className="text-xs text-muted">
            {subscribed ? "Ativas neste dispositivo" : "Desativadas neste dispositivo"}
          </span>
        </div>
      )}
    </CollapsibleCard>
  );
}
