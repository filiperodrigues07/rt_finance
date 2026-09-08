import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ErrorScreen } from "@/components/ui/ErrorScreen";

export function NotFoundPage() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = "Página não encontrada · RT Finance";
  }, []);
  return (
    <ErrorScreen
      code="404"
      title="Página não encontrada"
      description={
        <>
          O endereço <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">{pathname}</code> não
          existe ou foi movido.
        </>
      }
    />
  );
}
