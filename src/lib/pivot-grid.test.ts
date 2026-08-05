import { describe, it, expect } from "vitest";
import {
  applyPivotFilters,
  buildPivotGrid,
  drillPivot,
  pivotGridToCsv,
  pivotToMatrix,
  valueLabel,
} from "./pivot";
import type { Row } from "./types";

const ROWS: Row[] = [
  { region: "West", city: "Reno", quarter: "Q1", channel: "Web", revenue: 100, units: 2 },
  { region: "West", city: "Reno", quarter: "Q2", channel: "Web", revenue: 200, units: 4 },
  { region: "West", city: "Boise", quarter: "Q1", channel: "Store", revenue: 60, units: 1 },
  { region: "East", city: "Akron", quarter: "Q1", channel: "Web", revenue: 50, units: 3 },
  { region: "East", city: "Akron", quarter: "Q2", channel: "Store", revenue: 150, units: 5 },
  { region: "East", city: "Erie", quarter: "Q2", channel: "Store", revenue: 25, units: 1 },
];

const sum = { field: "revenue", agg: "sum" as const };

describe("valueLabel", () => {
  it("names a measure the way a pivot header does", () => {
    expect(valueLabel({ field: "revenue", agg: "sum" })).toBe("Sum of revenue");
    expect(valueLabel({ field: "revenue", agg: "avg" })).toBe("Average of revenue");
    expect(valueLabel({ field: null, agg: "count" })).toBe("Count of rows");
  });
});

describe("buildPivotGrid — nested shelves", () => {
  it("nests two row fields into one path per combination", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region", "city"],
      colFields: [],
      values: [sum],
    });

    expect(grid.rowKeys).toEqual([
      ["East", "Akron"],
      ["East", "Erie"],
      ["West", "Boise"],
      ["West", "Reno"],
    ]);
    expect(grid.rowTotals.map((t) => t[0])).toEqual([200, 25, 60, 300]);
  });

  it("crosses nested rows against a column field", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: ["quarter"],
      values: [sum],
    });

    expect(grid.rowKeys).toEqual([["East"], ["West"]]);
    expect(grid.colKeys).toEqual([["Q1"], ["Q2"]]);
    expect(grid.cells[0][0][0]).toBe(50); // East Q1
    expect(grid.cells[0][1][0]).toBe(175); // East Q2
    expect(grid.cells[1][0][0]).toBe(160); // West Q1
  });

  it("nests two column fields", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: ["quarter", "channel"],
      values: [sum],
    });

    expect(grid.colKeys).toEqual([
      ["Q1", "Store"],
      ["Q1", "Web"],
      ["Q2", "Store"],
      ["Q2", "Web"],
    ]);
    const west = grid.rowKeys.findIndex((p) => p[0] === "West");
    expect(grid.cells[west][0][0]).toBe(60); // West / Q1 / Store
    expect(grid.cells[west][3][0]).toBe(200); // West / Q2 / Web
  });

  it("carries several measures side by side", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: [],
      values: [sum, { field: "units", agg: "sum" }, { field: null, agg: "count" }],
    });

    expect(grid.valueLabels).toEqual(["Sum of revenue", "Sum of units", "Count of rows"]);
    const east = grid.rowKeys.findIndex((p) => p[0] === "East");
    expect(grid.rowTotals[east]).toEqual([225, 9, 3]);
  });

  it("supports every aggregation the shelf offers", () => {
    const spec = { rowFields: ["region"], colFields: [] };
    const of = (agg: "sum" | "avg" | "count" | "min" | "max") =>
      buildPivotGrid(ROWS, { ...spec, values: [{ field: "revenue", agg }] }).grandTotals[0];

    expect(of("sum")).toBe(585);
    expect(of("count")).toBe(6);
    expect(of("min")).toBe(25);
    expect(of("max")).toBe(200);
    expect(of("avg")).toBeCloseTo(97.5, 4);
  });

  it("reduces every total from the source rows, never an average of averages", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: ["quarter"],
      values: [{ field: "revenue", agg: "avg" }],
    });

    const east = grid.rowKeys.findIndex((p) => p[0] === "East");
    // (50 + 150 + 25) / 3 = 75, not the mean of the per-quarter means (68.75).
    expect(grid.rowTotals[east][0]).toBeCloseTo(75, 6);
  });

  it("leaves an empty combination blank rather than zero", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["city"],
      colFields: ["quarter"],
      values: [sum],
    });

    const boise = grid.rowKeys.findIndex((p) => p[0] === "Boise");
    const q2 = grid.colKeys.findIndex((p) => p[0] === "Q2");
    expect(grid.cells[boise][q2][0]).toBeNull();
  });

  it("counts the rows that survived the filters", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: [],
      values: [sum],
      filters: [{ field: "quarter", values: ["Q1"] }],
    });

    expect(grid.matchedRows).toBe(3);
    expect(grid.grandTotals[0]).toBe(210);
  });

  it("treats an unset filter as no filter at all", () => {
    const unset = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: [],
      values: [sum],
      filters: [{ field: "quarter", values: [] }],
    });
    expect(unset.grandTotals[0]).toBe(585);
  });

  it("folds the tail past the limit into one Other bucket", () => {
    const many: Row[] = Array.from({ length: 12 }, (_, i) => ({
      sku: `SKU-${i}`,
      revenue: 10,
    }));
    const grid = buildPivotGrid(many, {
      rowFields: ["sku"],
      colFields: [],
      values: [sum],
      limit: 4,
    });

    expect(grid.rowKeys).toHaveLength(5);
    expect(grid.rowKeys[4][0]).toBe("Other");
    // Nothing is lost in the fold: the grand total still covers every row.
    expect(grid.grandTotals[0]).toBe(120);
  });

  it("skips a row whose grouping value is blank", () => {
    const withBlank: Row[] = [...ROWS, { region: "  ", quarter: "Q1", revenue: 999 }];
    const grid = buildPivotGrid(withBlank, {
      rowFields: ["region"],
      colFields: [],
      values: [sum],
    });

    expect(grid.rowKeys.map((p) => p[0])).toEqual(["East", "West"]);
    expect(grid.grandTotals[0]).toBe(585);
  });

  it("counts a row whose measure is not numeric, but never sums it", () => {
    const dirty: Row[] = [
      { region: "West", revenue: 100 },
      { region: "West", revenue: "n/a" },
    ];

    const summed = buildPivotGrid(dirty, {
      rowFields: ["region"],
      colFields: [],
      values: [sum],
    });
    const counted = buildPivotGrid(dirty, {
      rowFields: ["region"],
      colFields: [],
      values: [{ field: null, agg: "count" }],
    });

    expect(summed.grandTotals[0]).toBe(100);
    expect(counted.grandTotals[0]).toBe(2);
  });

  it("falls back to counting rows when the Values shelf is empty", () => {
    const grid = buildPivotGrid(ROWS, { rowFields: ["region"], colFields: [], values: [] });
    expect(grid.valueLabels).toEqual(["Count of rows"]);
    expect(grid.grandTotals[0]).toBe(6);
  });
});

describe("applyPivotFilters", () => {
  it("keeps only rows every active filter admits", () => {
    const kept = applyPivotFilters(ROWS, [
      { field: "quarter", values: ["Q2"] },
      { field: "channel", values: ["Store"] },
    ]);
    expect(kept.map((r) => r.city)).toEqual(["Akron", "Erie"]);
  });
});

describe("drillPivot", () => {
  it("returns the source rows behind one cell", () => {
    const spec = { rowFields: ["region"], colFields: ["quarter"], values: [sum] };
    const rows = drillPivot(ROWS, spec, ["East"], ["Q2"]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.revenue).sort((a, b) => Number(a) - Number(b))).toEqual([25, 150]);
  });

  it("returns a whole row band when the column path is a total", () => {
    const spec = { rowFields: ["region"], colFields: ["quarter"], values: [sum] };
    expect(drillPivot(ROWS, spec, ["West"], null)).toHaveLength(3);
  });

  it("drills a nested path down every level", () => {
    const spec = { rowFields: ["region", "city"], colFields: [], values: [sum] };
    const rows = drillPivot(ROWS, spec, ["West", "Reno"], null);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.city === "Reno")).toBe(true);
  });

  it("respects the filters the grid was built with", () => {
    const spec = {
      rowFields: ["region"],
      colFields: [],
      values: [sum],
      filters: [{ field: "quarter", values: ["Q1"] }],
    };
    expect(drillPivot(ROWS, spec, ["West"], null)).toHaveLength(2);
  });

  it("drills the folded Other bucket to everything the ranking left out", () => {
    const many: Row[] = Array.from({ length: 8 }, (_, i) => ({ sku: `SKU-${i}`, revenue: 10 }));
    const spec = { rowFields: ["sku"], colFields: [], values: [sum], limit: 3 };
    const rows = drillPivot(many, spec, ["Other"], null);

    expect(rows).toHaveLength(5);
    const grid = buildPivotGrid(many, spec);
    expect(grid.rowTotals[grid.rowKeys.findIndex((p) => p[0] === "Other")][0]).toBe(50);
  });
});

describe("pivotToMatrix / pivotGridToCsv", () => {
  it("lays out headers, cells, and totals as a rectangle", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: ["quarter"],
      values: [sum],
    });
    const matrix = pivotToMatrix(grid);

    const widths = new Set(matrix.map((line) => line.length));
    expect(widths.size).toBe(1);
    expect(matrix[0][0]).toBe("quarter");
    expect(matrix[matrix.length - 1][0]).toBe("Total");
  });

  it("carries the grand total into the bottom-right corner", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: ["quarter"],
      values: [sum],
    });
    const matrix = pivotToMatrix(grid);
    const lastLine = matrix[matrix.length - 1];

    expect(lastLine[lastLine.length - 1]).toBe(585);
  });

  it("quotes a value containing a comma so the CSV survives", () => {
    const rows: Row[] = [{ label: "Lagos, NG", revenue: 5 }];
    const grid = buildPivotGrid(rows, { rowFields: ["label"], colFields: [], values: [sum] });

    expect(pivotGridToCsv(grid)).toContain('"Lagos, NG"');
  });

  it("names each measure when several share the grid", () => {
    const grid = buildPivotGrid(ROWS, {
      rowFields: ["region"],
      colFields: ["quarter"],
      values: [sum, { field: "units", agg: "sum" }],
    });
    const csv = pivotGridToCsv(grid);

    expect(csv).toContain("Sum of revenue");
    expect(csv).toContain("Sum of units");
  });
});
