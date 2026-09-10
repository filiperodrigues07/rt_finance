import { useEffect, useState } from "react";
import { Sparkles, Plus, X } from "lucide-react";
import { getPrefs, onPrefsChange, patchPrefs } from "@/lib/preferences";
import { useAccounts, useCreditCards } from "@/lib/hooks";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";

/** Padrões de lançamento, período inicial e atalhos rápidos. Sincroniza no login. */
export function PersonalizationPanel() {
  const [p, setP] = useState(getPrefs);
  useEffect(() => onPrefsChange(() => setP(getPrefs())), []);
  const accounts = useAccounts();
  const cards = useCreditCards();

  const [tplLabel, setTplLabel] = useState("");
  const [tplText, setTplText] = useState("");

  const addTpl = () => {
    if (!tplLabel.trim() || !tplText.trim()) return;
    patchPrefs({
      quickAddTemplates: [
        ...p.quickAddTemplates,
        { label: tplLabel.trim().slice(0, 24), text: tplText.trim().slice(0, 120) },
      ].slice(0, 12),
    });
    setTplLabel("");
    setTplText("");
  };
  const removeTpl = (i: number) =>
    patchPrefs({ quickAddTemplates: p.quickAddTemplates.filter((_, x) => x !== i) });

  return (
    <CollapsibleCard
      id="personalization"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted" /> Personalização
        </span>
      }
      description="Período inicial, conta/cartão padrão e atalhos de lançamento."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Período inicial">
            <Select
              value={p.defaultPeriod}
              onChange={(e) => patchPrefs({ defaultPeriod: e.target.value as typeof p.defaultPeriod })}
            >
              <option value="THIS_MONTH">Este mês</option>
              <option value="LAST_MONTH">Mês passado</option>
              <option value="THIS_YEAR">Este ano</option>
            </Select>
          </Field>
          <Field label="Conta padrão">
            <Select
              value={p.defaults.accountId ?? ""}
              onChange={(e) => patchPrefs({ defaults: { accountId: e.target.value || null } })}
            >
              <option value="">Nenhuma</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cartão padrão">
            <Select
              value={p.defaults.cardId ?? ""}
              onChange={(e) => patchPrefs({ defaults: { cardId: e.target.value || null } })}
            >
              <option value="">Nenhum</option>
              {(cards.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Seu apelido" hint="Aparece no lugar do seu nome nas telas.">
          <Input
            value={p.defaults.nickname ?? ""}
            maxLength={40}
            onChange={(e) => patchPrefs({ defaults: { nickname: e.target.value } })}
            placeholder="opcional"
          />
        </Field>

        <div>
          <span className="label">Atalhos de lançamento rápido</span>
          {p.quickAddTemplates.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {p.quickAddTemplates.map((t, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1.5 text-sm"
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="text-xs text-muted">· {t.text}</span>
                  <button
                    className="grid size-5 place-items-center rounded-full text-muted hover:bg-border hover:text-fg"
                    onClick={() => removeTpl(i)}
                    aria-label="Remover"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Field label="Rótulo">
                <Input value={tplLabel} onChange={(e) => setTplLabel(e.target.value)} placeholder="Almoço" />
              </Field>
            </div>
            <div className="min-w-[10rem] flex-1">
              <Field label="Texto">
                <Input
                  value={tplText}
                  onChange={(e) => setTplText(e.target.value)}
                  placeholder="gastei 25 no almoço"
                />
              </Field>
            </div>
            <Button size="sm" variant="outline" onClick={addTpl}>
              <Plus className="size-4" /> Adicionar
            </Button>
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
