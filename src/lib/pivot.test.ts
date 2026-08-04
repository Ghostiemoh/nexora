import { describe, it, expect } from "vitest";
import { buildPivot, pivotToCsv, TOTAL_COLUMN } from "./pivot";
import type { Row } from "./types";

const ROWS: Row[] = [
  { region: "West", quarter: "Q1", revenue: 100 },
  { region: "West", quarter: "Q2", revenue: 200 },
  { region: "East", quarter: "Q1", revenue: 50 },
  { region: "East", quarter: "Q2", revenue: 150 },
  { region: "East", quarter: "Q2", revenue: 25 },
];

describe("buildPivot", () => {
  it("cross-tabulates two dimensions and sums the measure", () => {
    const p = buildPivot(ROWS, { rowField: "region", colField: "quarter", measure: "revenue", agg: "sum" });
    expect(p.rowKeys).toEqual(["East", "West"]);
    expect(p.colKeys).toEqual(["Q1", "Q2"]);
    expect(p.cells[0]).toEqual([50, 175]); // East
    expect(p.cells[1]).toEqual([100, 200]); // West
  });

  it("totals both directions from the source rows", () => {
    const p = buildPivot(ROWS, { rowField: "region", colField: "quarter", measure: "revenue", agg: "sum" });
    expect(p.rowTotals).toEqual([225, 300]);
    expect(p.colTotals).toEqual([150, 375]);
    expect(p.grandTotal).toBe(525);
  });

  it("averages from the underlying values, never an average of averages", () => {
    const p = buildPivot(ROWS, { rowField: "region", colField: null, measure: "revenue", agg: "avg" });
    const east = p.rowKeys.indexOf("East");
    // (50 + 150 + 25) / 3, not the mean of the per-quarter means.
    expect(p.rowTotals[east]).toBeCloseTo(75, 6);
    expect(p.grandTotal).toBeCloseTo(105, 6);
  });

  it("collapses to a single Total column when no column field is chosen", () => {
    const p = buildPivot(ROWS, { rowField: "region", colField: null, measure: "revenue", agg: "sum" });
    expect(p.colKeys).toEqual([TOTAL_COLUMN]);
    expect(p.cells.map((r) => r[0])).toEqual([225, 300]);
  });

  it("counts rows when there is no measure", () => {
    const p = buildPivot(ROWS, { rowField: "region", colField: "quarter", measure: null, agg: "count" });
    expect(p.grandTotal).toBe(5);
    expect(p.rowTotals[p.rowKeys.indexOf("East")]).toBe(3);
    expect(p.valueLabel).toBe("Count of rows");
  });

  it("leaves empty combinations blank rather than showing a zero", () => {
    const sparse: Row[] = [
      { a: "x", b: "1", v: 10 },
      { a: "y", b: "2", v: 20 },
    ];
    const p = buildPivot(sparse, { rowField: "a", colField: "b", measure: "v", agg: "sum" });
    expect(p.cells[0][1]).toBeNull();
    expect(p.cells[1][0]).toBeNull();
  });

  it("skips blank keys instead of grouping them under an empty label", () => {
    const messy: Row[] = [...ROWS, { region: "  ", quarter: "Q1", revenue: 999 }, { region: null, quarter: "Q1", revenue: 5 }];
    const p = buildPivot(messy, { rowField: "region", colField: "quarter", measure: "revenue", agg: "sum" });
    expect(p.rowKeys).toEqual(["East", "West"]);
    expect(p.grandTotal).toBe(525);
  });

  it("parses currency-formatted measures", () => {
    const money: Row[] = [
      { region: "West", amount: "$1,000" },
      { region: "West", amount: "$500" },
    ];
    const p = buildPivot(money, { rowField: "region", colField: null, measure: "amount", agg: "sum" });
    expect(p.grandTotal).toBe(1500);
  });

  it("folds a long tail into Other so the table stays readable", () => {
    const wide: Row[] = Array.from({ length: 30 }, (_, i) => ({ k: `k${i}`, v: 1 }));
    const p = buildPivot(wide, { rowField: "k", colField: null, measure: "v", agg: "sum", limit: 5 });
    expect(p.rowKeys).toHaveLength(6);
    expect(p.rowKeys.at(-1)).toBe("Other");
    expect(p.grandTotal).toBe(30);
  });
});

describe("pivotToCsv", () => {
  it("writes a header, the body, and a totals row", () => {
    const p = buildPivot(ROWS, { rowField: "region", colField: "quarter", measure: "revenue", agg: "sum" });
    const lines = pivotToCsv(p, "region").split("\n");
    expect(lines[0]).toBe("region,Q1,Q2,Total");
    expect(lines[1]).toBe("East,50,175,225");
    expect(lines.at(-1)).toBe("Total,150,375,525");
  });

  it("quotes values containing commas", () => {
    const rows: Row[] = [{ name: "Lagos, NG", v: 1 }];
    const p = buildPivot(rows, { rowField: "name", colField: null, measure: "v", agg: "sum" });
    expect(pivotToCsv(p, "name")).toContain('"Lagos, NG"');
  });
});
