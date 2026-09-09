import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Linha de formulário: empilha em 1 coluna no celular e abre em N colunas a
 * partir de `sm`. Substitui os `grid grid-cols-2` cravados que espremiam no mobile.
 */
export function FormRow({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}
