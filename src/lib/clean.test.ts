import { describe, it, expect } from "vitest";
import { applyCleanOp } from "./clean";
import { iqrFences, percentile } from "./number";
import type { Row } from "./types";

/** 20 values sitting between 10 and 29, plus one extreme on each side. The
 *  fences land clear of the body of the distribution, so only the two spikes
 *  are outside them. */
function outlierRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i++) rows.push({ region: "West", amount: 10 + i });
  rows.push({ region: "West", amount: 5000 });
  rows.push({ region: "West", amount: -900 });
  return rows;
}

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

describe("iqrFences", () => {
  it("returns the same 1.5×IQR fences the profiler reports", () => {
    const numbers = outlierRows()
      .map((r) => Number(r.amount))
      .sort((a, b) => a - b);
    const fences = iqrFences(numbers);
    const p25 = percentile(numbers, 25);
    const p75 = percentile(numbers, 75);
    expect(fences!.lo).toBeCloseTo(p25 - 1.5 * (p75 - p25), 9);
    expect(fences!.hi).toBeCloseTo(p75 + 1.5 * (p75 - p25), 9);
  });

  it("returns null when there are too few values to fence", () => {
    expect(iqrFences([1, 2, 3])).toBeNull();
  });
});

describe("outlier treatment", () => {
  it("winsorizes values onto the fence instead of deleting them", () => {
    const rows = outlierRows();
    const out = applyCleanOp(rows, { kind: "capOutliers", column: "amount" });
    const numbers = rows.map((r) => Number(r.amount)).sort((a, b) => a - b);
    const { lo, hi } = iqrFences(numbers)!;

    expect(out).toHaveLength(rows.length); // no row is lost
    expect(out[20].amount).toBeCloseTo(hi, 9); // 5000 pulled down to the fence
    expect(out[21].amount).toBeCloseTo(lo, 9); // -900 pulled up to the fence
    expect(out[0].amount).toBe(10); // in-range values untouched
    expect(out[19].amount).toBe(29);
  });

  it("leaves the column alone when nothing sits outside the fences", () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ amount: 100 + i }));
    expect(applyCleanOp(rows, { kind: "capOutliers", column: "amount" })).toEqual(rows);
  });

  it("removes only the rows holding an out-of-fence value", () => {
    const rows = outlierRows();
    const out = applyCleanOp(rows, { kind: "dropOutlierRows", column: "amount" });
    expect(out).toHaveLength(20);
    expect(out.some((r) => Number(r.amount) === 5000)).toBe(false);
    expect(out.some((r) => Number(r.amount) === -900)).toBe(false);
  });

  it("keeps rows whose value is blank rather than treating them as outliers", () => {
    const rows: Row[] = [...outlierRows(), { region: "East", amount: null }];
    const out = applyCleanOp(rows, { kind: "dropOutlierRows", column: "amount" });
    expect(out.some((r) => r.amount === null)).toBe(true);
  });

  it("is a no-op on a column that holds no numbers", () => {
    const rows: Row[] = [{ name: "a" }, { name: "b" }, { name: "c" }];
    expect(applyCleanOp(rows, { kind: "capOutliers", column: "name" })).toEqual(rows);
    expect(applyCleanOp(rows, { kind: "dropOutlierRows", column: "name" })).toEqual(rows);
  });
});
