import { useEffect, useState } from "react";

/**
 * Recharts aplica stroke/fill como ATRIBUTO SVG — `var(--x)` do CSS não resolve lá.
 * Este hook lê os tokens já resolvidos do `<html>` e recalcula quando o tema (classe
 * .dark) ou o hue (data-hue) mudam, para os gráficos seguirem o acento do usuário.
 */
export interface ChartTheme {
  accent: string;
  positive: string;
  negative: string;
  grid: string;
  axis: string;
  reduced: boolean;
}

function readVar(name: string): string {
  if (typeof window === "undefined") return "0 0 0";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "0 0 0";
}

function compute(): ChartTheme {
  const rgb = (name: string, alpha = 1) =>
    alpha === 1 ? `rgb(${readVar(name)})` : `rgb(${readVar(name)} / ${alpha})`;
  return {
    accent: rgb("--accent"),
    positive: rgb("--positive"),
    negative: rgb("--negative"),
    grid: rgb("--muted", 0.14),
    axis: rgb("--muted", 0.9),
    reduced:
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  };
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(compute);

  useEffect(() => {
    const update = () => setTheme(compute());
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-hue"] });
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", update);
    return () => {
      obs.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);

  return theme;
}
