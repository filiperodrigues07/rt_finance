import { useState } from "react";
import { Landmark } from "lucide-react";
import { bankById } from "@rt-finance/shared";
import { cn } from "@/lib/cn";

/**
 * Badge do banco: mostra o logo de `apps/web/public/banks/<logo>` se existir,
 * senão um chip com a cor da marca + inicial. Sem banco → ícone genérico.
 */
export function BankBadge({
  id,
  size = 32,
  className,
}: {
  id?: string | null;
  size?: number;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const bank = bankById(id);
  const box = { width: size, height: size } as const;
  const radius = Math.max(6, Math.round(size * 0.24));

  if (!bank) {
    return (
      <span
        style={{ ...box, borderRadius: radius }}
        className={cn("grid shrink-0 place-items-center bg-surface-2 text-muted", className)}
      >
        <Landmark style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }

  if (bank.logo && !imgFailed) {
    return (
      <span
        style={{ ...box, borderRadius: radius }}
        className={cn("grid shrink-0 place-items-center overflow-hidden bg-white p-1", className)}
      >
        <img
          src={`/banks/${bank.logo}`}
          alt={bank.name}
          onError={() => setImgFailed(true)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      style={{ ...box, borderRadius: radius, background: bank.color, color: bank.fg ?? "#fff" }}
      className={cn("grid shrink-0 place-items-center font-bold", className)}
    >
      <span style={{ fontSize: size * 0.44 }}>{bank.name.charAt(0)}</span>
    </span>
  );
}
