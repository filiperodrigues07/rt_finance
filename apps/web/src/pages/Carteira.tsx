import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Wallet, CreditCard, Repeat, Target, Tag, Upload } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { useAccounts, useCreditCards, useRecurring } from "@/lib/hooks";
import { PageHeader } from "@/components/ui/data";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { ImportDialog } from "@/components/ImportDialog";
import { AccountsPage } from "./Accounts";
import { CardsPage } from "./Cards";
import { RecurrencesPage } from "./Recurrences";
import { CategoriesPage } from "./Categories";
import { BudgetsPanel } from "@/components/panels/BudgetsPanel";

const TABS = [
  { value: "contas", label: "Contas", icon: <Wallet className="size-4" /> },
  { value: "cartoes", label: "Cartões", icon: <CreditCard className="size-4" /> },
  { value: "recorrencias", label: "Recorrências", icon: <Repeat className="size-4" /> },
  { value: "orcamentos", label: "Orçamentos", icon: <Target className="size-4" /> },
  { value: "categorias", label: "Categorias", icon: <Tag className="size-4" /> },
];

export function CarteiraPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab")! : "contas";

  const [importOpen, setImportOpen] = useState(false);
  const accounts = useAccounts();
  const cards = useCreditCards();
  const recurring = useRecurring();

  const patrimonio = (accounts.data ?? []).reduce((a, x) => a + x.balanceCents, 0);
  const limiteTotal = (cards.data ?? []).reduce((a, x) => a + x.limits.limitCents, 0);
  const recMes = (recurring.data ?? [])
    .filter((r) => r.active && r.amountCents != null && r.frequency === "MONTHLY")
    .reduce((a, r) => a + (r.amountCents ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Carteira"
        subtitle="Contas, cartões, recorrências e orçamentos num lugar só"
        actions={
          (tab === "contas" || tab === "cartoes") && (
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Importar
            </Button>
          )
        }
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultKind={tab === "cartoes" ? "CARD" : "BANK"}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Mini label="Patrimônio" value={formatBRL(patrimonio)} />
        <Mini label="Limite dos cartões" value={formatBRL(limiteTotal)} />
        <Mini label="Recorrências / mês" value={formatBRL(recMes)} />
      </div>

      <Tabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={TABS} className="mb-5" />

      <div className="animate-in">
        {tab === "contas" && <AccountsPage />}
        {tab === "cartoes" && <CardsPage />}
        {tab === "recorrencias" && <RecurrencesPage />}
        {tab === "orcamentos" && <BudgetsPanel />}
        {tab === "categorias" && <CategoriesPage />}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card min-w-0 p-3">
      <div className="truncate text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tnum mt-1 truncate text-sm font-semibold tracking-tight sm:text-base">{value}</div>
    </div>
  );
}
