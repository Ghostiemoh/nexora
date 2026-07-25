import { describe, it, expect } from "vitest";
import { applyCleanOp } from "./clean";
import type { Row } from "./types";

describe("applyCleanOp", () => {
  it("drops exact duplicate rows", () => {
    const rows: Row[] = [{ a: 1 }, { a: 1 }, { a: 2 }];
    expect(applyCleanOp(rows, { kind: "dropDuplicates" })).toHaveLength(2);
  });

  it("drops whitespace-only rows", () => {
    const rows: Row[] = [{ a: "x", b: "y" }, { a: "  ", b: "" }];
    expect(applyCleanOp(rows, { kind: "dropEmptyRows" })).toHaveLength(1);
  });

  it("trims whitespace on string cells", () => {
    const rows: Row[] = [{ a: "  hi  " }];
    expect(applyCleanOp(rows, { kind: "trimWhitespace" })[0].a).toBe("hi");
  });

  it("imputes median using formatted numbers", () => {
    const rows: Row[] = [{ amount: "1,200" }, { amount: null }, { amount: "800" }];
    const out = applyCleanOp(rows, { kind: "fillMissing", column: "amount", strategy: "median" });
    // median of [800, 1200] = 1000
    expect(out[1].amount).toBe(1000);
  });
});
