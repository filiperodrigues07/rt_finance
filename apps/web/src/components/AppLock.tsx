import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Delete, Fingerprint, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { buzz } from "@/lib/haptics";
import {
  autolockMin,
  biometricRegistered,
  lockEnabled,
  verifyBiometric,
  verifyPin,
} from "@/lib/applock";

let hiddenAt = 0;

/** Envolve o app: mostra a tela de PIN quando a trava local está ligada e "vencida". */
export function AppLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => lockEnabled());

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (lockEnabled() && Date.now() - hiddenAt >= autolockMin() * 60_000) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    // liga/desliga a trava vindo das Configurações
    const onChange = () => setLocked(lockEnabled());
    window.addEventListener("rt:lock-changed", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("rt:lock-changed", onChange);
    };
  }, []);

  if (!locked) return <>{children}</>;
  return <LockScreen onUnlock={() => setLocked(false)} />;
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const tried = useRef(false);

  const tryBiometric = useCallback(async () => {
    if (!biometricRegistered()) return;
    if (await verifyBiometric()) {
      buzz("success");
      onUnlock();
    }
  }, [onUnlock]);

  useEffect(() => {
    if (!tried.current) {
      tried.current = true;
      void tryBiometric();
    }
  }, [tryBiometric]);

  useEffect(() => {
    if (pin.length < 4) return;
    void (async () => {
      if (await verifyPin(pin)) {
        buzz("success");
        onUnlock();
      } else {
        buzz("error");
        setWrong(true);
        setTimeout(() => {
          setWrong(false);
          setPin("");
        }, 450);
      }
    })();
  }, [pin, onUnlock]);

  const press = (d: string) => {
    if (pin.length >= 4) return;
    buzz("tap");
    setPin((p) => p + d);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-2 text-accent">
          <Lock className="size-6" />
        </div>
        <p className="mt-4 text-sm text-muted">Digite o PIN pra abrir o RT Finance</p>

        <div className={cn("mt-5 flex justify-center gap-3", wrong && "animate-shake")}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border",
                i < pin.length ? "border-accent bg-accent" : "border-border",
              )}
            />
          ))}
        </div>

        <div className="mx-auto mt-6 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="grid h-14 place-items-center rounded-xl bg-surface-2 text-xl font-medium active:bg-border"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => void tryBiometric()}
            className="grid h-14 place-items-center rounded-xl text-muted active:bg-surface-2"
            aria-label="Usar biometria"
          >
            {biometricRegistered() ? <Fingerprint className="size-6" /> : null}
          </button>
          <button
            onClick={() => press("0")}
            className="grid h-14 place-items-center rounded-xl bg-surface-2 text-xl font-medium active:bg-border"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="grid h-14 place-items-center rounded-xl text-muted active:bg-surface-2"
            aria-label="Apagar"
          >
            <Delete className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
