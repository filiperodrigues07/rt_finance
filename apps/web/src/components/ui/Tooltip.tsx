import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "right" | "bottom" | "left";

/**
 * Tooltip leve (hover + foco de teclado). Envolve o conteúdo num wrapper inline
 * que carrega os handlers — sem brigar com o ref do filho. Portal para o body.
 */
export function Tooltip({
  label,
  side = "top",
  className,
  children,
}: {
  label: string;
  side?: Side;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function show() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 8;
      setPos(
        side === "right"
          ? { x: r.right + gap, y: r.top + r.height / 2 }
          : side === "left"
            ? { x: r.left - gap, y: r.top + r.height / 2 }
            : side === "bottom"
              ? { x: r.left + r.width / 2, y: r.bottom + gap }
              : { x: r.left + r.width / 2, y: r.top - gap },
      );
    }, 120);
  }
  function hide() {
    window.clearTimeout(timer.current);
    setPos(null);
  }

  const translate =
    side === "right"
      ? "translate(0, -50%)"
      : side === "left"
        ? "translate(-100%, -50%)"
        : side === "bottom"
          ? "translate(-50%, 0)"
          : "translate(-50%, -100%)";

  return (
    <>
      <span
        ref={ref}
        className={className ?? "inline-flex"}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[120] whitespace-nowrap rounded-md border border-border bg-elevated px-2 py-1 text-xs font-medium text-fg shadow-pop"
            style={{ left: pos.x, top: pos.y, transform: translate }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
