import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export function Avatar({
  name,
  src,
  color,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size } as const;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      style={{ ...style, background: color ? `${color}22` : "rgb(var(--accent) / 0.15)", color: color ?? "rgb(var(--accent))" }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        size <= 28 ? "text-[10px]" : size <= 40 ? "text-xs" : "text-sm",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
