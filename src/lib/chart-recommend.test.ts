import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import {
  recommendChart,
  recommendTypeFor,
  compatibleTypes,
  buildChartSeries,
  aggregateBy,
  columnRoles,
  CHART_TYPES,
  type ChartConfig,
} from "./chart-recommend";
import type { Row } from "./types";

function makeDataset(name: string, columns: string[], rows: Row[]) {
  return profileDataset({ id: "t", name, columns, rows, createdAt: 0, changelog: [] });
}

/** Sales-shaped: a date, a category, a second category, and two measures. */
const salesRows: Row[] = Array.from({ length: 60 }, (_, i) => ({
  date: `2024-${String(1 + (i % 12)).padStart(2, "0")}-15`,
  region: ["North", "South", "East", "West"][i % 4],
  channel: ["Online", "Retail"][i % 2],
  revenue: 100 + i * 10,
  units: 5 + (i % 7),
}));
const sales = makeDataset("sales.csv", ["date", "region", "channel", "revenue", "units"], salesRows);

describe("columnRoles", () => {
  it("separates measures, dimensions, and dates", () => {
    const roles = columnRoles(sales);
    expect(roles.measures).toEqual(expect.arrayContaining(["revenue", "units"]));
    expect(roles.dimensions).toEqual(expect.arrayContaining(["region", "channel"]));
    expect(roles.dates).toEqual(["date"]);
  });
});

describe("recommendTypeFor", () => {
  it("picks a line chart for a date axis", () => {
    const rec = recommendTypeFor(sales, "date", "revenue");
    expect(rec.type).toBe("line");
    expect(rec.reason).toContain("over time");
  });

  it("picks a scatter plot for two numeric axes", () => {
    expect(recommendTypeFor(sales, "revenue", "units").type).toBe("scatter");
  });

  it("picks a histogram for a lone numeric column", () => {
    expect(recommendTypeFor(sales, "revenue", null).type).toBe("histogram");
  });

  it("picks a doughnut for a low-cardinality category", () => {
    expect(recommendTypeFor(sales, "channel", "revenue").type).toBe("doughnut");
  });

  it("picks a bar chart for a wide category", () => {
    const wide = makeDataset(
      "wide.csv",
      ["sku", "revenue"],
      Array.from({ length: 60 }, (_, i) => ({ sku: `SKU-${i % 20}`, revenue: i }))
    );
    expect(recommendTypeFor(wide, "sku", "revenue").type).toBe("bar");
  });

  it("picks a heatmap when a second dimension is supplied", () => {
    expect(recommendTypeFor(sales, "region", "revenue", "channel").type).toBe("heatmap");
  });

  it("never proposes a part-to-whole chart for a measure that goes negative", () => {
    const pnl = makeDataset(
      "pnl.csv",
      ["unit", "profit"],
      Array.from({ length: 20 }, (_, i) => ({
        unit: ["A", "B", "C"][i % 3],
        profit: i % 3 === 0 ? -500 : 400,
      }))
    );
    const rec = recommendTypeFor(pnl, "unit", "profit");
    expect(rec.type).not.toBe("pie");
    expect(rec.type).not.toBe("doughnut");
  });
});

describe("recommendChart", () => {
  it("defaults a time-series dataset to a line chart over the date column", () => {
    const rec = recommendChart(sales);
    expect(rec.config.type).toBe("line");
    expect(rec.config.x).toBe("date");
    expect(rec.config.y).toBe("revenue");
    expect(rec.reason).toBeTruthy();
  });

  it("offers the other fitting types as alternatives, never itself", () => {
    const rec = recommendChart(sales);
    expect(rec.alternatives).not.toContain(rec.config.type);
    expect(rec.alternatives).toContain("bar");
  });

  it("falls back to a histogram when the dataset is purely numeric", () => {
    const nums = makeDataset(
      "nums.csv",
      ["score"],
      Array.from({ length: 30 }, (_, i) => ({ score: i * 3 }))
    );
    const rec = recommendChart(nums);
    expect(rec.config.type).toBe("histogram");
  });

  it("produces a config that actually builds a series", () => {
    const rec = recommendChart(sales);
    expect(buildChartSeries(sales, rec.config)).not.toBeNull();
  });
});

describe("compatibleTypes", () => {
  const base: ChartConfig = { type: "bar", x: "region", y: "revenue", series: null, agg: "sum" };

  it("reports every chart type exactly once", () => {
    const result = compatibleTypes(sales, base);
    expect(result.map((r) => r.type).sort()).toEqual([...CHART_TYPES].sort());
  });

  it("blocks scatter without two numeric axes and explains why", () => {
    const scatter = compatibleTypes(sales, base).find((r) => r.type === "scatter")!;
    expect(scatter.ok).toBe(false);
    expect(scatter.reason).toContain("numeric");
  });

  it("blocks heatmap until a second dimension is chosen", () => {
    expect(compatibleTypes(sales, base).find((r) => r.type === "heatmap")!.ok).toBe(false);
    expect(
      compatibleTypes(sales, { ...base, series: "channel" }).find((r) => r.type === "heatmap")!.ok
    ).toBe(true);
  });

  it("blocks pie when the category has too many slices to read", () => {
    const wide = makeDataset(
      "wide.csv",
      ["sku", "revenue"],
      Array.from({ length: 200 }, (_, i) => ({ sku: `SKU-${i}`, revenue: i }))
    );
    const pie = compatibleTypes(wide, { ...base, x: "sku" }).find((r) => r.type === "pie")!;
    expect(pie.ok).toBe(false);
    expect(pie.reason).toContain("too many slices");
  });

  it("every type it marks ok can actually be built", () => {
    const config: ChartConfig = { type: "bar", x: "region", y: "revenue", series: "channel", agg: "sum" };
    for (const t of compatibleTypes(sales, config)) {
      if (!t.ok) continue;
      expect(buildChartSeries(sales, { ...config, type: t.type }), `${t.type} built null`).not.toBeNull();
    }
  });
});

describe("aggregateBy", () => {
  const rows: Row[] = [
    { g: "a", v: 10 },
    { g: "a", v: 20 },
    { g: "b", v: 7 },
    { g: "b", v: null },
    { g: "", v: 99 },
  ];

  it("sums, averages, and takes extremes per group", () => {
    expect(aggregateBy(rows, "g", "v", "sum")).toEqual([
      { name: "a", value: 30 },
      { name: "b", value: 7 },
    ]);
    expect(aggregateBy(rows, "g", "v", "avg")).toEqual([
      { name: "a", value: 15 },
      { name: "b", value: 7 },
    ]);
    expect(aggregateBy(rows, "g", "v", "max")[0]).toEqual({ name: "a", value: 20 });
    expect(aggregateBy(rows, "g", "v", "min")).toContainEqual({ name: "b", value: 7 });
  });

  it("counts rows when the aggregation is count, ignoring the measure", () => {
    expect(aggregateBy(rows, "g", "v", "count")).toEqual([
      { name: "a", value: 2 },
      { name: "b", value: 2 },
    ]);
  });

  it("skips blank group keys", () => {
    expect(aggregateBy(rows, "g", "v", "sum").map((d) => d.name)).not.toContain("");
  });
});

describe("buildChartSeries", () => {
  const base: ChartConfig = { type: "bar", x: "region", y: "revenue", series: null, agg: "sum" };

  it("returns a sorted category series for bars", () => {
    const s = buildChartSeries(sales, base)!;
    expect(s.shape).toBe("category");
    if (s.shape !== "category") throw new Error("wrong shape");
    expect(s.filterColumn).toBe("region");
    expect(s.data[0].value).toBeGreaterThanOrEqual(s.data[1].value);
  });

  it("buckets a date axis into chronological order", () => {
    const s = buildChartSeries(sales, { ...base, type: "line", x: "date" })!;
    expect(s.shape).toBe("time");
    if (s.shape !== "time") throw new Error("wrong shape");
    const names = s.data.map((d) => d.name);
    expect([...names].sort()).toEqual(names);
  });

  it("emits x/y pairs for scatter and reports nothing omitted under the cap", () => {
    const s = buildChartSeries(sales, { ...base, type: "scatter", x: "revenue", y: "units" })!;
    expect(s.shape).toBe("scatter");
    if (s.shape !== "scatter") throw new Error("wrong shape");
    expect(s.data).toHaveLength(60);
    expect(s.omitted).toBe(0);
  });

  it("caps scatter points and reports how many were dropped", () => {
    // Deliberately not 0..n: a serial column is a row index, not a measure.
    const big = makeDataset(
      "big.csv",
      ["a", "b"],
      Array.from({ length: 2500 }, (_, i) => ({ a: (i * 7) % 977, b: (i * 13) % 811 }))
    );
    const s = buildChartSeries(big, { type: "scatter", x: "a", y: "b", agg: "sum" })!;
    if (s.shape !== "scatter") throw new Error("wrong shape");
    expect(s.data).toHaveLength(2000);
    expect(s.omitted).toBe(500);
  });

  it("bins numeric values for a histogram", () => {
    const s = buildChartSeries(sales, { ...base, type: "histogram", x: "revenue", y: null })!;
    expect(s.shape).toBe("bins");
    if (s.shape !== "bins") throw new Error("wrong shape");
    expect(s.data.reduce((sum, b) => sum + b.value, 0)).toBe(60);
  });

  it("cross-tabulates a full matrix for a heatmap", () => {
    const s = buildChartSeries(sales, { ...base, type: "heatmap", series: "channel" })!;
    expect(s.shape).toBe("matrix");
    if (s.shape !== "matrix") throw new Error("wrong shape");
    expect(s.rows).toHaveLength(4);
    expect(s.cols).toHaveLength(2);
    expect(s.cells).toHaveLength(8);
    expect(s.max).toBeGreaterThanOrEqual(s.min);
  });

  it("keeps heatmap keys distinct when values contain spaces", () => {
    const spaced = makeDataset(
      "spaced.csv",
      ["a", "b"],
      [
        { a: "x y", b: "z" },
        { a: "x", b: "y z" },
      ]
    );
    const s = buildChartSeries(spaced, { type: "heatmap", x: "a", y: null, series: "b", agg: "count" })!;
    if (s.shape !== "matrix") throw new Error("wrong shape");
    const filled = s.cells.filter((c) => c.value > 0);
    expect(filled).toHaveLength(2);
    expect(s.max).toBe(1);
  });

  it("folds a long tail into Other for pie charts", () => {
    const wide = makeDataset(
      "wide.csv",
      ["sku", "revenue"],
      Array.from({ length: 100 }, (_, i) => ({ sku: `SKU-${i % 20}`, revenue: 10 }))
    );
    const s = buildChartSeries(wide, { type: "pie", x: "sku", y: "revenue", agg: "sum" })!;
    if (s.shape !== "category") throw new Error("wrong shape");
    expect(s.data).toHaveLength(9);
    expect(s.data.at(-1)!.name).toBe("Other");
  });

  it("returns null instead of throwing on an impossible config", () => {
    expect(buildChartSeries(sales, { type: "scatter", x: "region", y: "channel", agg: "sum" })).toBeNull();
    expect(buildChartSeries(sales, { type: "bar", x: null, y: "revenue", agg: "sum" })).toBeNull();
  });
});
