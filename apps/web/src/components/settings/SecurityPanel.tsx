import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  autolockMin,
  biometricAvailable,
  biometricRegistered,
  disableLock,
  enableLock,
  lockEnabled,
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

function fire() {
  window.dispatchEvent(new Event("rt:lock-changed"));
}

/** Trava do app por PIN (+ biometria) — só neste dispositivo. */
export function SecurityPanel() {
  const toast = useToast();
  const [enabled, setEnabled] = useState(lockEnabled);
  const [min, setMin] = useState(String(autolockMin()));
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [bioOk, setBioOk] = useState(false);
  const [bioReg, setBioReg] = useState(biometricRegistered);

  useEffect(() => {
    void biometricAvailable().then(setBioOk);
  }, []);

  async function turnOn() {
    if (!/^\d{4}$/.test(pin1)) return toast.error("PIN de 4 dígitos");
    if (pin1 !== pin2) return toast.error("Os PINs não batem");
    await setPin(pin1);
    enableLock(Number(min) || 0);
    setEnabled(true);
    setPin1("");
    setPin2("");
    fire();
    toast.success("Trava ativada");
  }

  function turnOff() {
    disableLock();
    setEnabled(false);
    setBioReg(false);
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
      description="Pede um PIN pra abrir o app neste aparelho. Não é a senha da conta — é privacidade."
    >
      {!enabled ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="PIN (4 dígitos)">
              <Input
                inputMode="numeric"
                maxLength={4}
                value={pin1}
                onChange={(e) => setPin1(e.target.value.replace(/\D/g, ""))}
                type="password"
              />
            </Field>
            <Field label="Repita o PIN">
              <Input
                inputMode="numeric"
                maxLength={4}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                type="password"
              />
            </Field>
          </div>
          <Field label="Bloquear">
            <Select value={min} onChange={(e) => setMin(e.target.value)}>
              {AUTOLOCK.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="sm" onClick={turnOn}>
            Ativar trava
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Bloquear">
            <Select
              value={min}
              onChange={(e) => {
                setMin(e.target.value);
                setAutolock(Number(e.target.value) || 0);
                fire();
              }}
            >
              {AUTOLOCK.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          {bioOk && (
            <div className="flex items-center gap-3 text-sm">
              {bioReg ? (
                <span className="text-positive">Biometria ativada</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const ok = await registerBiometric();
                    setBioReg(ok);
                    toast[ok ? "success" : "error"](ok ? "Biometria ativada" : "Não consegui ativar");
                  }}
                >
                  Ativar biometria
                </Button>
              )}
            </div>
          )}
          <Button size="sm" variant="danger" onClick={turnOff}>
            Desativar trava
          </Button>
        </div>
      )}
    </CollapsibleCard>
  );
}
