import { describe, it, expect } from "vitest";
import { parseNumeric, hasLeadingZeroId, isIdentifierName } from "./number";

describe("parseNumeric", () => {
  it("parses plain and formatted numbers", () => {
    expect(parseNumeric(42)).toBe(42);
    expect(parseNumeric("1,200")).toBe(1200);
    expect(parseNumeric("$1,200.50")).toBe(1200.5);
    expect(parseNumeric("₦2,000")).toBe(2000);
    expect(parseNumeric("50%")).toBe(50);
  });

  it("parses accounting negatives", () => {
    expect(parseNumeric("(1,200)")).toBe(-1200);
  });

  it("rejects non-numeric, hex, and booleans", () => {
    expect(parseNumeric("0x10")).toBeNull();
    expect(parseNumeric("abc")).toBeNull();
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("   ")).toBeNull();
    expect(parseNumeric(true)).toBeNull();
    expect(parseNumeric(null)).toBeNull();
    expect(parseNumeric(NaN)).toBeNull();
  });
});

describe("hasLeadingZeroId", () => {
  it("flags leading-zero identifier strings", () => {
    expect(hasLeadingZeroId("00123")).toBe(true);
    expect(hasLeadingZeroId("123")).toBe(false);
    expect(hasLeadingZeroId(123)).toBe(false);
    expect(hasLeadingZeroId("0")).toBe(false);
  });
});

describe("isIdentifierName", () => {
  it("recognises identifier-like column names", () => {
    expect(isIdentifierName("customer_id")).toBe(true);
    expect(isIdentifierName("zip")).toBe(true);
    expect(isIdentifierName("phone_number")).toBe(true);
    expect(isIdentifierName("monthly_charge")).toBe(false);
    expect(isIdentifierName("revenue")).toBe(false);
  });
});
