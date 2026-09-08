import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "dark" | "light" | "system";
export type Hue = "blue" | "pink";
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
    const v = localStorage.getItem(KEY_HUE);
    return v === "blue" || v === "pink" ? v : null;
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

  return (
    <ThemeContext.Provider
      value={{
        pref,
        resolved,
        setPref: setPrefState,
        toggle: () => setPrefState(resolved === "dark" ? "light" : "dark"),
        hue,
        hueChosen: hueState !== null,
        setHue: (h) => {
          setHueState(h);
          try {
            localStorage.setItem(KEY_HUE, h);
          } catch {
            /* ignore */
          }
        },
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
