import { useCallback, useEffect, useState } from "react";

const KEY = "rt-density";

/** Densidade das tabelas: "cozy" (padrão) ou "compact". Persistida e global. */
export function useDensity() {
  const [dense, setDense] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "compact";
    } catch {
      return false;
    }
  });

  // mantém abas/telas em sincronia
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setDense(e.newValue === "compact");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback(() => {
    setDense((d) => {
      const next = !d;
      try {
        localStorage.setItem(KEY, next ? "compact" : "cozy");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { dense, toggle };
}
