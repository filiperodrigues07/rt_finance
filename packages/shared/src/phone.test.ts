import { describe, it, expect } from "vitest";
import {
  formatPhoneBR,
  isValidPhoneBR,
  maskPhoneBR,
  phoneCandidates,
  phonesMatch,
  toE164BR,
} from "./phone";

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

describe("maskPhoneBR / formatPhoneBR / isValidPhoneBR", () => {
  it("mascara enquanto digita", () => {
    expect(maskPhoneBR("")).toBe("");
    expect(maskPhoneBR("4")).toBe("(4");
    expect(maskPhoneBR("49")).toBe("(49");
    expect(maskPhoneBR("49999")).toBe("(49) 999");
    expect(maskPhoneBR("4999964")).toBe("(49) 99964");
    expect(maskPhoneBR("499996484")).toBe("(49) 99964-84");
    expect(maskPhoneBR("49999648444")).toBe("(49) 99964-8444");
  });

  it("aceita o que foi colado com +55, pontuação ou sem o 9", () => {
    expect(maskPhoneBR("+55 (49) 99964-8444")).toBe("(49) 99964-8444");
    expect(maskPhoneBR("5549999648444")).toBe("(49) 99964-8444");
    expect(formatPhoneBR("554999648444")).toBe("(49) 99964-8444");
    expect(formatPhoneBR("+5549999648444")).toBe("(49) 99964-8444");
  });

  it("qualquer grafia vira o mesmo E.164", () => {
    for (const v of ["(49) 99964-8444", "49 9964-8444", "5549999648444", "+554999648444"]) {
      expect(toE164BR(v)).toBe("+5549999648444");
    }
  });

  it("recusa o que não dá para entender", () => {
    expect(isValidPhoneBR("123")).toBe(false);
    expect(isValidPhoneBR("(49) 9996")).toBe(false);
    expect(isValidPhoneBR("(49) 99964-8444")).toBe(true);
  });
});
