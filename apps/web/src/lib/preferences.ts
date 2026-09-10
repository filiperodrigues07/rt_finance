import { userPreferences, type UserPreferences, type UpdateUserPreferences } from "@rt-finance/shared";
import { api } from "./api";

/**
 * Preferências do usuário sincronizadas no servidor. localStorage é cache/fallback.
 * Faz a ponte com os storages legados (rt-theme / rt-hue / rt-density) pra que
 * theme.tsx e useDensity continuem funcionando sem mudança.
 */

const KEY = "rt-prefs";
const EVENT = "rt:prefs";

function readLocal(): UserPreferences {
  try {
    return userPreferences.parse(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return userPreferences.parse({});
  }
}

let cache: UserPreferences = readLocal();

export function getPrefs(): UserPreferences {
  return cache;
}

function writeLocal(p: UserPreferences): void {
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    // ponte com o legado
    localStorage.setItem("rt-theme", p.theme.mode);
    localStorage.setItem("rt-hue", p.theme.accent);
    localStorage.setItem("rt-density", p.theme.density === "compact" ? "compact" : "cozy");
  } catch {
    /* ignore */
  }
}

/** Aplica tema/densidade no <html>. */
export function applyPrefs(p: UserPreferences = cache): void {
  const el = document.documentElement;
  const dark =
    p.theme.mode === "dark" ||
    (p.theme.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  el.classList.toggle("dark", dark);
  el.dataset.hue = p.theme.accent;
  el.style.setProperty("--rt-font-scale", String(p.theme.fontScale));
  el.classList.toggle("dense", p.theme.density === "compact");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#090a0d" : "#faf9f6");
}

function deepMerge<T>(base: T, patch: unknown): T {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Merge local + aplica + persiste no servidor (fire-and-forget). */
export function patchPrefs(patch: UpdateUserPreferences): void {
  const next = userPreferences.parse(deepMerge(cache, patch));
  writeLocal(next);
  applyPrefs(next);
  window.dispatchEvent(new Event(EVENT));
  window.dispatchEvent(new Event("rt:density")); // acorda useDensity
  api.put("/me/preferences", patch).catch(() => {});
}

/** Busca do servidor uma vez, aplica e guarda. Chamar após o login. */
export async function syncPrefsFromServer(): Promise<void> {
  try {
    const server = await api.get<UserPreferences>("/me/preferences");
    const parsed = userPreferences.parse(server);
    writeLocal(parsed);
    applyPrefs(parsed);
    window.dispatchEvent(new Event(EVENT));
    window.dispatchEvent(new Event("rt:density"));
  } catch {
    /* offline: mantém o cache local */
  }
}

/** Assina mudanças (mesma aba). */
export function onPrefsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
