import { forwardRef, type InputHTMLAttributes } from "react";
import { Input } from "./Field";
import { maskMoney } from "@/lib/format";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "inputMode" | "type"> & {
  /** string já mascarada ("1.234,56" ou "") — use `centsToMasked(cents)` para semear. */
  value: string;
  /** recebe a string mascarada; parseie com `toCents(value)` no submit. */
  onChange: (masked: string) => void;
};

/** Campo de dinheiro com máscara acumuladora (dígitos → centavos → "1.234,56"). */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { value, onChange, placeholder = "0,00", ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(maskMoney(e.target.value))}
      {...rest}
    />
  );
});
