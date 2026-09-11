import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  autolockMin,
  biometricAvailable,
  biometricRegistered,
  clearPin,
  disableLock,
  enableLock,
  lockEnabled,
  lockHasPin,
  registerBiometric,
  setAutolock,
  setPin,
} from "@/lib/applock";
import { useToast } from "@/lib/toast";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";

const AUTOLOCK = [
  { v: "0", label: "Sempre ao abrir" },
  { v: "1", label: "Após 1 min" },
  { v: "5", label: "Após 5 min" },
  { v: "15", label: "Após 15 min" },
];

const fire = () => window.dispatchEvent(new Event("rt:lock-changed"));

/** Trava do app por Face ID / digital (ou PIN) — só neste dispositivo. */
export function SecurityPanel() {
  const toast = useToast();
  const [enabled, setEnabled] = useState(lockEnabled);
  const [hasPin, setHasPin] = useState(lockHasPin);
  const [hasBio, setHasBio] = useState(biometricRegistered);
  const [bioOk, setBioOk] = useState(false);
  const [min, setMin] = useState(String(autolockMin()));
  const [pinForm, setPinForm] = useState(false);
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");

  useEffect(() => {
    void biometricAvailable().then(setBioOk);
  }, []);

  async function turnOnBiometric() {
    const ok = await registerBiometric();
    if (!ok) return toast.error("Não consegui ativar o Face ID / digital");
    enableLock(Number(min) || 0);
    setEnabled(true);
    setHasBio(true);
    fire();
    toast.success("Trava ativada com Face ID / digital");
  }

  async function savePin() {
    if (!/^\d{4}$/.test(pin1)) return toast.error("PIN de 4 dígitos");
    if (pin1 !== pin2) return toast.error("Os PINs não batem");
    await setPin(pin1);
    if (!enabled) enableLock(Number(min) || 0);
    setEnabled(true);
    setHasPin(true);
    setPinForm(false);
    setPin1("");
    setPin2("");
    fire();
    toast.success("PIN salvo");
  }

  function turnOff() {
    disableLock();
    setEnabled(false);
    setHasPin(false);
    setHasBio(false);
    fire();
    toast.success("Trava desativada");
  }

  return (
    <CollapsibleCard
      id="security"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted" /> Trava do app
        </span>
      }
      description="Pede Face ID / digital (ou um PIN) pra abrir o app neste aparelho. Não é a senha da conta."
    >
      <div className="space-y-3">
        {enabled ? (
          <p className="text-sm">
            Ativa —{" "}
            {[hasBio && "Face ID / digital", hasPin && "PIN"].filter(Boolean).join(" + ") || "—"}
          </p>
        ) : (
          <p className="text-sm text-muted">Desativada neste dispositivo.</p>
        )}

        <Field label="Bloquear">
          <Select
            value={min}
            onChange={(e) => {
              setMin(e.target.value);
              if (enabled) {
                setAutolock(Number(e.target.value) || 0);
                fire();
              }
            }}
          >
            {AUTOLOCK.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-wrap gap-2">
          {bioOk && !hasBio && (
            <Button size="sm" onClick={turnOnBiometric}>
              {enabled ? "Adicionar Face ID / digital" : "Ativar com Face ID / digital"}
            </Button>
          )}
          {!hasPin && (
            <Button size="sm" variant="outline" onClick={() => setPinForm((v) => !v)}>
              {enabled ? "Adicionar PIN" : "Ativar com PIN"}
            </Button>
          )}
          {hasPin && enabled && (
            <Button size="sm" variant="outline" onClick={() => setPinForm((v) => !v)}>
              Trocar PIN
            </Button>
          )}
          {hasPin && hasBio && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearPin();
                setHasPin(false);
                fire();
                toast.success("PIN removido — fica só o Face ID / digital");
              }}
            >
              Remover PIN
            </Button>
          )}
          {enabled && (
            <Button size="sm" variant="danger" onClick={turnOff}>
              Desativar trava
            </Button>
          )}
        </div>

        {pinForm && (
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <Field label="PIN (4 dígitos)">
              <Input
                inputMode="numeric"
                maxLength={4}
                type="password"
                value={pin1}
                onChange={(e) => setPin1(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Repita o PIN">
              <Input
                inputMode="numeric"
                maxLength={4}
                type="password"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button size="sm" onClick={savePin}>
                Salvar PIN
              </Button>
            </div>
          </div>
        )}

        {!bioOk && (
          <p className="text-xs text-muted">
            Este aparelho/navegador não expõe Face ID / digital pro app — use o PIN. No iPhone,
            instale o app na tela inicial e abra por lá.
          </p>
        )}
      </div>
    </CollapsibleCard>
  );
}
