import { describe, it, expect } from "vitest";
import { checkPassword, strongPassword } from "./schemas/common.js";

describe("checkPassword", () => {
  it("aprova senha com as 4 classes e ≥8", () => {
    const { ok, rules } = checkPassword("Str0ng!pass");
    expect(ok).toBe(true);
    expect(rules).toEqual({ len: true, upper: true, lower: true, digit: true, special: true });
  });

  it("reprova por falta de maiúscula", () => {
    const { ok, rules } = checkPassword("str0ng!pass");
    expect(ok).toBe(false);
    expect(rules.upper).toBe(false);
  });

  it("reprova por falta de especial", () => {
    expect(checkPassword("Str0ngpass").ok).toBe(false);
  });

  it("reprova por comprimento", () => {
    expect(checkPassword("Ab1!x").rules.len).toBe(false);
  });

  it("aceita acento como caractere especial", () => {
    expect(checkPassword("Senh4çada").ok).toBe(true);
  });
});

describe("strongPassword (zod)", () => {
  it("passa numa senha forte", () => {
    expect(strongPassword.safeParse("Str0ng!pass").success).toBe(true);
  });
  it("falha numa fraca com mensagem", () => {
    const r = strongPassword.safeParse("test1234");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toMatch(/mai[úu]scula/i);
  });
  it("rejeita acima de 128 caracteres", () => {
    expect(strongPassword.safeParse("Aa1!".repeat(40)).success).toBe(false);
  });
});
