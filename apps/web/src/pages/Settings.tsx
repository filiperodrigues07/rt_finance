import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHouseholdMutations } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PageHeader } from "@/components/ui/data";
import { WhatsAppPanel } from "@/components/settings/WhatsAppPanel";

export function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { resetData } = useHouseholdMutations();

  const [dngConfirm, setDngConfirm] = useState("");
  const [dngPwd, setDngPwd] = useState("");
  const [dngAccounts, setDngAccounts] = useState(false);
  const [dngCards, setDngCards] = useState(false);
  const [dngCategories, setDngCategories] = useState(false);
  const [dngErr, setDngErr] = useState<string | null>(null);

  async function wipeData(e: React.FormEvent) {
    e.preventDefault();
    setDngErr(null);
    try {
      const r = await resetData.mutateAsync({
        confirm: "LIMPAR",
        password: dngPwd,
        alsoAccounts: dngAccounts,
        alsoCards: dngCards,
        alsoCategories: dngCategories,
      });
      toast.success(`Dados limpos: ${r.cleared.join(", ")}`);
      navigate("/");
    } catch (err) {
      setDngErr(err instanceof ApiError ? err.message : "Não foi possível limpar");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configurações"
        subtitle="Integração com WhatsApp e exclusão de dados. Perfil e senha ficam em Usuários."
      />

      <WhatsAppPanel />

      {user?.role === "OWNER" && (
        <Card className="border-negative/40">
          <CardHeader
            title={
              <span className="flex items-center gap-2 text-negative">
                <AlertTriangle className="size-4" /> Zona de perigo
              </span>
            }
            description="Limpar dados para começar a usar de verdade. Isto NÃO tem volta."
          />
          <form onSubmit={wipeData} className="space-y-3">
            <p className="text-sm text-muted">
              Sempre apaga o <strong className="text-fg">histórico</strong>: lançamentos, parcelas,
              faturas, recorrências, metas, orçamentos, importações, anexos, notificações e conversas
              do bot. Marque abaixo o que também quer apagar:
            </p>
            <div className="space-y-2 text-sm">
              {[
                ["contas", dngAccounts, setDngAccounts] as const,
                ["cartões", dngCards, setDngCards] as const,
                ["categorias (recria as padrão)", dngCategories, setDngCategories] as const,
              ].map(([label, val, set]) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="size-4 accent-[rgb(var(--negative))]"
                  />
                  Também apagar {label}
                </label>
              ))}
            </div>
            <Field label="Digite LIMPAR para confirmar">
              <Input
                value={dngConfirm}
                onChange={(e) => setDngConfirm(e.target.value)}
                placeholder="LIMPAR"
                autoComplete="off"
              />
            </Field>
            <Field label="Sua senha" error={dngErr ?? undefined}>
              <PasswordInput
                value={dngPwd}
                onChange={(e) => setDngPwd(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Button
              type="submit"
              size="sm"
              variant="danger"
              loading={resetData.isPending}
              disabled={dngConfirm !== "LIMPAR" || !dngPwd}
            >
              <Trash2 className="size-4" /> Limpar dados
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
