import { cn } from "@/lib/cn";
import { useCountUp } from "@/lib/useCountUp";

const NF = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Quebra "R$ 1.234,56" em símbolo · corpo · centavos para estilizar cada parte. */
function parts(cents: number) {
  const p = NF.formatToParts(Math.round(cents) / 100);
  let sign = "";
  let sym = "";
  let body = "";
  let frac = "";
  for (const seg of p) {
    if (seg.type === "minusSign") sign = "−";
    else if (seg.type === "currency") sym = seg.value;
    else if (seg.type === "fraction") frac = seg.value;
    else if (seg.type === "literal" && seg.value.trim() === "") continue;
    else body += seg.value; // integer, group, decimal
  }
  return { sign, sym, body, frac };
}

export function Money({
  cents,
  animate = false,
  tone,
  className,
}: {
  cents: number;
  animate?: boolean;
  tone?: "positive" | "negative" | "muted";
  className?: string;
}) {
  const live = useCountUp(animate ? cents : cents, animate ? 380 : 0);
  const { sign, sym, body, frac } = parts(animate ? live : cents);
  return (
    <span
      className={cn(
        "money whitespace-nowrap",
        tone === "positive" && "text-positive",
        tone === "negative" && "text-negative",
        tone === "muted" && "text-muted",
        className,
      )}
    >
      {sign}
      <span className="money-sym">{sym}</span>
      {body}
      <span className="money-cents">{frac}</span>
    </span>
  );
}
