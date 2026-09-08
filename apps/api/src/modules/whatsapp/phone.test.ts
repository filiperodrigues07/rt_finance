import { describe, it, expect } from "vitest";
import { phoneCandidates, phonesMatch, toE164BR } from "./phone";

describe("phonesMatch", () => {
  it("casa com/sem +55 e com/sem o 9", () => {
    expect(phonesMatch("+5549999648444", "5549999648444")).toBe(true);
    expect(phonesMatch("+5549999648444", "4999648444")).toBe(true);
    expect(phonesMatch("49 99964-8444", "5549999648444@s.whatsapp.net")).toBe(true);
  });
  it("números diferentes não casam", () => {
    expect(phonesMatch("+5549999648444", "+5549999648445")).toBe(false);
  });
});

describe("phoneCandidates", () => {
  it("inclui as formas plausíveis de um celular BR", () => {
    const c = phoneCandidates("5549999648444@s.whatsapp.net");
    expect(c).toContain("+5549999648444");
    expect(c).toContain("+554999648444"); // sem o 9
    expect(c.length).toBeGreaterThan(1);
  });
  it("bate com o E.164 canônico", () => {
    const e = toE164BR("49 99964-8444");
    expect(phoneCandidates("5549999648444")).toContain(e);
  });
});
