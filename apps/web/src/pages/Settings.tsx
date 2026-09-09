import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, AlertTriangle, Download, Upload, RotateCcw, DatabaseBackup } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHouseholdMutations, useBackup } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PageHeader } from "@/components/ui/data";
import { WhatsAppPanel } from "@/components/settings/WhatsAppPanel";
import { EmailPanel } from "@/components/settings/EmailPanel";
import { AppearancePanel } from "@/components/settings/AppearancePanel";

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
        subtitle="WhatsApp, e-mail e exclusão de dados. Perfil e senha ficam em Usuários."
      />

      <AppearancePanel />

      <WhatsAppPanel />

      <EmailPanel />

      {user?.role === "OWNER" && <BackupPanel />}

      {user?.role === "OWNER" && (
        <CollapsibleCard
          id="danger"
          defaultOpen={false}
          className="border-negative/40"
          title={
            <span className="flex items-center gap-2 text-negative">
              <AlertTriangle className="size-4" /> Zona de perigo
            </span>
          }
          description="Limpar dados para começar a usar de verdade. Isto NÃO tem volta."
        >
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
        </CollapsibleCard>
      )}
    </div>
  );
}

function BackupPanel() {
  const toast = useToast();
  const { downloadBackup, restore } = useBackup();
  const [dl, setDl] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pwd, setPwd] = useState("");
  const [word, setWord] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doDownload() {
    setDl(true);
    try {
      await downloadBackup();
      toast.success("Backup baixado");
    } catch {
      toast.error("Não consegui gerar o backup");
    } finally {
      setDl(false);
    }
  }

  async function doRestore(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) return;
    try {
      const r = await restore.mutateAsync({ file, password: pwd });
      const total = Object.values(r.restored).reduce((a, n) => a + Number(n), 0);
      toast.success(`Restaurado: ${total} registros. Recarregando…`);
      setTimeout(() => window.location.assign("/"), 900);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Falha ao restaurar");
    }
  }

  return (
    <CollapsibleCard
      id="backup"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          <DatabaseBackup className="size-4" /> Backup e restauração
        </span>
      }
      description="Baixe uma cópia de tudo e restaure a partir dela quando precisar."
    >
      <div className="space-y-4">
        <div>
          <Button size="sm" variant="secondary" loading={dl} onClick={doDownload}>
            <Download className="size-4" /> Baixar backup
          </Button>
          <p className="mt-1.5 text-xs text-muted">
            Arquivo .json com contas, cartões, categorias, lançamentos (com anexos), faturas,
            parcelamentos, recorrências, metas e orçamentos.
          </p>
        </div>

        <form onSubmit={doRestore} className="space-y-3 border-t border-border pt-4">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setErr(null);
                setWord("");
                setPwd("");
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Escolher arquivo…
            </Button>
            {file && <span className="ml-2 text-xs text-muted">{file.name}</span>}
          </div>

          {file && (
            <>
              <p className="text-sm text-negative">
                Restaurar <strong className="text-fg">substitui TODOS</strong> os dados atuais do
                casal pelos do arquivo. Não tem volta.
              </p>
              <Field label="Digite RESTAURAR para confirmar">
                <Input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="RESTAURAR"
                  autoComplete="off"
                />
              </Field>
              <Field label="Sua senha" error={err ?? undefined}>
                <PasswordInput
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <Button
                type="submit"
                size="sm"
                variant="danger"
                loading={restore.isPending}
                disabled={word !== "RESTAURAR" || !pwd}
              >
                <RotateCcw className="size-4" /> Restaurar backup
              </Button>
            </>
          )}
        </form>
      </div>
    </CollapsibleCard>
  );
}
