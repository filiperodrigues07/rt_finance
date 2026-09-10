import { useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { buzz } from "@/lib/haptics";

const THRESHOLD = 72;
const MAX = 110;

/** Puxar pra baixo no topo (mobile) → revalida as queries. Desktop: sem efeito. */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  const onStart = (e: React.TouchEvent) => {
    if (busy) return;
    const el = document.scrollingElement || document.documentElement;
    if (el.scrollTop > 0 || window.innerWidth >= 1024) return;
    startY.current = e.touches[0]?.clientY ?? null;
  };
  const onMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    setPull(Math.min(MAX, dy * 0.5));
  };
  const onEnd = async () => {
    if (startY.current == null) return;
    const reached = pull >= THRESHOLD;
    startY.current = null;
    if (!reached) {
      setPull(0);
      return;
    }
    buzz("tap");
    setBusy(true);
    setPull(THRESHOLD);
    try {
      await Promise.all([
        qc.invalidateQueries(),
        new Promise((r) => setTimeout(r, 450)),
      ]);
    } finally {
      setBusy(false);
      setPull(0);
    }
  };

  return (
    <div onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
      <div
        className="grid place-items-center overflow-hidden text-muted transition-[height] duration-150"
        style={{ height: pull }}
      >
        <RefreshCw
          className={cn("size-5", busy ? "animate-spin" : pull >= THRESHOLD && "text-accent")}
          style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)` }}
        />
      </div>
      {children}
    </div>
  );
}
