import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "accent-surface bg-accent text-accent-fg hover:opacity-90 active:opacity-95",
  secondary: "bg-surface-2 text-fg hover:bg-border/60 active:bg-border/80",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2/80",
  danger: "bg-negative text-white hover:opacity-90 active:opacity-95",
  outline: "border border-border text-fg hover:bg-surface-2 active:bg-surface-2/80",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  // alvo de toque >= 40px (mobile-first)
  icon: "size-10 shrink-0 justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-lg font-medium",
        "transition-[background-color,color,opacity,box-shadow,transform] duration-150 ease-smooth",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
});
