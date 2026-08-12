import { describe, it, expect } from "vitest";
import { checkPassword, passwordMeetsPolicy, PASSWORD_MIN_LENGTH } from "./password-policy";

describe("the password policy", () => {
  it("accepts a password that satisfies every rule", () => {
    expect(passwordMeetsPolicy("Ledger#42")).toBe(true);
  });

  it("rejects one that is too short, even when it is otherwise complex", () => {
    expect(passwordMeetsPolicy("Ab#3")).toBe(false);
  });

  it("rejects one with no uppercase letter", () => {
    expect(passwordMeetsPolicy("ledger#42x")).toBe(false);
  });

  it("rejects one with no symbol", () => {
    expect(passwordMeetsPolicy("Ledger42xy")).toBe(false);
  });

  it("rejects the empty string without throwing", () => {
    expect(passwordMeetsPolicy("")).toBe(false);
  });

  /* The panel renders one line per rule, so the caller needs to know which
   * specific rule failed rather than a single boolean. */
  it("reports each rule separately so the reader can see which one failed", () => {
    const rules = checkPassword("ledger42xy");
    expect(rules.find((r) => r.id === "length")?.met).toBe(true);
    expect(rules.find((r) => r.id === "uppercase")?.met).toBe(false);
    expect(rules.find((r) => r.id === "symbol")?.met).toBe(false);
  });

  it("counts a password of exactly the minimum length as long enough", () => {
    const exact = "A#" + "a".repeat(PASSWORD_MIN_LENGTH - 2);
    expect(exact).toHaveLength(PASSWORD_MIN_LENGTH);
    expect(checkPassword(exact).find((r) => r.id === "length")?.met).toBe(true);
  });

  /* Whitespace pads the length without adding anything an attacker must guess,
   * and a reader who typed a space would otherwise be told they had satisfied
   * the symbol rule. */
  it("does not accept a space as the symbol", () => {
    expect(checkPassword("Ledger 42x").find((r) => r.id === "symbol")?.met).toBe(false);
  });

  it("accepts any of the symbols the field suggests", () => {
    for (const symbol of ["#", "$", "%", "^", "&", "*"]) {
      expect(passwordMeetsPolicy(`Ledger42x${symbol}`)).toBe(true);
    }
  });

  /* Non-ASCII input should not be silently treated as a symbol or a capital:
   * the rules are about characters the reader can find on their keyboard. */
  it("treats an accented capital as uppercase", () => {
    expect(checkPassword("Édouard#12").find((r) => r.id === "uppercase")?.met).toBe(true);
  });
});
