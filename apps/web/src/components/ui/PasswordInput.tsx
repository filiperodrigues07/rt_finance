import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { checkPassword, PASSWORD_RULE_LABELS } from "@rt-finance/shared";
import { cn } from "@/lib/cn";
import { Input } from "./Field";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** mostra o "olhinho" para revelar a senha (padrão: true) */
  toggle?: boolean;
  /** começa com a senha visível (ex.: dono definindo a senha inicial de alguém) */
  defaultVisible?: boolean;
};

/** Campo de senha com botão de mostrar/ocultar. */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { toggle = true, defaultVisible = false, className, ...props },
  ref,
) {
  const [show, setShow] = useState(defaultVisible);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        className={cn(toggle && "pr-10", className)}
        {...props}
      />
      {toggle && (
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted transition-colors hover:text-fg"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
});

/** Checklist ao vivo da política de senha — cada regra fica verde quando cumprida. */
export function PasswordRules({ value, className }: { value: string; className?: string }) {
  const { rules } = checkPassword(value);
  return (
    <ul className={cn("mt-2 grid gap-1 text-xs sm:grid-cols-2", className)}>
      {PASSWORD_RULE_LABELS.map(({ key, label }) => {
        const done = rules[key];
        return (
          <li
            key={key}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              done ? "text-positive" : "text-muted",
            )}
          >
            <span
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-full border text-[9px] font-bold",
                done ? "border-positive bg-positive/15" : "border-border",
              )}
            >
              {done ? "✓" : ""}
            </span>
            {label}
          </li>
        );
      })}
    </ul>
  );
}
