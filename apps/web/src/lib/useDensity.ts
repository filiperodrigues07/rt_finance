import { useCallback, useEffect, useState } from "react";
import { patchPrefs } from "./preferences";

const KEY = "rt-density";
const EVENT = "rt:density";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "compact";
  } catch {
    return false;
  }
}

/** Aplica/remove a classe global — chame no boot e a cada mudança. */
export function applyDensityClass(): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dense", read());
  }
}

/**
 * Densidade da interface: "cozy" (padrão) ou "compact". Persistida, global e
 * sincronizada entre componentes na mesma aba (evento `rt:density`) e entre abas
 * (evento `storage`). Além do state, alterna a classe `dense` no <html>.
 */
export function useDensity() {
  const [dense, setDense] = useState(read);

  useEffect(() => {
    const sync = () => setDense(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) sync();
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setValue = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "compact" : "cozy");
    } catch {
      /* ignore */
    }
    applyDensityClass();
    window.dispatchEvent(new Event(EVENT));
    patchPrefs({ theme: { density: next ? "compact" : "cozy" } });
  }, []);

  const toggle = useCallback(() => setValue(!read()), [setValue]);

  return { dense, toggle, setDense: setValue };
}
