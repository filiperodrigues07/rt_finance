import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getPrefs, onPrefsChange, patchPrefs } from "./preferences";

export type ThemePref = "dark" | "light" | "system";
export type Hue = "blue" | "pink" | "violet" | "emerald" | "amber" | "rose" | "slate";
const HUES: Hue[] = ["blue", "pink", "violet", "emerald", "amber", "rose", "slate"];
type Resolved = "dark" | "light";

const KEY = "rt-theme";
const KEY_HUE = "rt-hue";

interface ThemeCtx {
  pref: ThemePref;
  resolved: Resolved;
  setPref: (p: ThemePref) => void;
  /** alterna dark <-> light (ignora system) */
  toggle: () => void;
  hue: Hue;
  /** true se o usuário já escolheu a cor (senão, pode aplicar o padrão dele) */
  hueChosen: boolean;
  setHue: (h: Hue) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

function readHue(): Hue | null {
  try {
    const v = localStorage.getItem(KEY_HUE) as Hue | null;
    return v && HUES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [resolved, setResolved] = useState<Resolved>(() =>
    readPref() === "light" ? "light" : readPref() === "system" && !systemDark() ? "light" : "dark",
  );
  const [hueState, setHueState] = useState<Hue | null>(readHue);
  const hue: Hue = hueState ?? "blue";

  useEffect(() => {
    const apply = () => {
      const r: Resolved = pref === "system" ? (systemDark() ? "dark" : "light") : pref;
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", r === "dark" ? "#090a0d" : "#faf9f6");
    };
    apply();
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.hue = hue;
  }, [hue]);

  // adota mudanças vindas das preferências sincronizadas (outra aba / servidor / painel)
  useEffect(() => {
    return onPrefsChange(() => {
      const p = getPrefs();
      setPrefState(p.theme.mode);
      setHueState(p.theme.accent);
    });
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    patchPrefs({ theme: { mode: p } });
  };
  const setHue = (h: Hue) => {
    setHueState(h);
    patchPrefs({ theme: { accent: h } });
  };

  return (
    <ThemeContext.Provider
      value={{
        pref,
        resolved,
        setPref,
        toggle: () => setPref(resolved === "dark" ? "light" : "dark"),
        hue,
        hueChosen: hueState !== null,
        setHue,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme fora do ThemeProvider");
  return ctx;
}
