import { describe, it, expect } from "vitest";
import { buildDashboard, valueCounts, sumBy, topWithOther, binNumeric, bucketByDate, pearson } from "./auto-dashboard";
import { profileDataset } from "./profile";
import type { Row } from "./types";

const REGIONS = ["North", "South", "East"];

function makeSalesRows(n = 60): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      region: REGIONS[i % 3],
      product: `P-${i % 10}`,
      amount: 100 + (i % 20) * 10,
      qty: 1 + (i % 20), // correlates with amount
      date: `2024-0${1 + (i % 6)}-15`,
    });
  }
  return rows;
}

function makeDataset(rows: Row[]) {
  return profileDataset({
    id: "t1",
    name: "sales.csv",
    columns: Object.keys(rows[0]),
    rows,
    createdAt: 0,
    changelog: [],
  });
}

describe("helpers", () => {
  it("valueCounts counts trimmed values descending and skips blanks", () => {
    const rows: Row[] = [
      { c: "a" }, { c: " a " }, { c: "b" }, { c: null }, { c: "  " },
    ];
    expect(valueCounts(rows, "c")).toEqual([
      { name: "a", value: 2 },
      { name: "b", value: 1 },
    ]);
  });

  it("sumBy aggregates numerics (currency included) per category", () => {
    const rows: Row[] = [
      { r: "x", v: "$1,000" },
      { r: "x", v: 500 },
      { r: "y", v: 200 },
      { r: "y", v: "n/a" },
    ];
    expect(sumBy(rows, "r", "v")).toEqual([
      { name: "x", value: 1500 },
      { name: "y", value: 200 },
    ]);
  });

  it("topWithOther folds the tail into Other", () => {
    const data = [
      { name: "a", value: 10 },
      { name: "b", value: 5 },
      { name: "c", value: 3 },
      { name: "d", value: 2 },
    ];
    expect(topWithOther(data, 2)).toEqual([
      { name: "a", value: 10 },
      { name: "b", value: 5 },
      { name: "Other", value: 5 },
    ]);
  });

  it("binNumeric produces equal-width bins covering min..max", () => {
    const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({ v: i }));
    const bins = binNumeric(rows, "v", 10);
    expect(bins).toHaveLength(10);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(100);
  });

  it("binNumeric collapses constant columns to one bin", () => {
    const rows: Row[] = [{ v: 5 }, { v: 5 }, { v: 5 }];
    expect(binNumeric(rows, "v")).toEqual([{ bin: "5", count: 3 }]);
  });

  it("bucketByDate sums by day for short spans and by month for long spans", () => {
    const short: Row[] = [
      { d: "2024-01-01", v: 10 },
      { d: "2024-01-01", v: 5 },
      { d: "2024-01-02", v: 7 },
    ];
    expect(bucketByDate(short, "d", "v")).toEqual([
      { date: "2024-01-01", value: 15 },
      { date: "2024-01-02", value: 7 },
    ]);

    const long: Row[] = [
      { d: "2024-01-10", v: 1 },
      { d: "2024-06-10", v: 2 },
      { d: "2024-06-20", v: 3 },
    ];
    expect(bucketByDate(long, "d", "v")).toEqual([
      { date: "2024-01", value: 1 },
      { date: "2024-06", value: 5 },
    ]);
  });

  it("pearson detects a perfect linear relationship", () => {
    const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({ a: i, b: i * 2 + 1 }));
    expect(pearson(rows, "a", "b")).toBeCloseTo(1, 5);
  });

  it("pearson returns null under 10 paired samples", () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ a: i, b: i }));
    expect(pearson(rows, "a", "b")).toBeNull();
  });
});

describe("buildDashboard", () => {
  const ds = makeDataset(makeSalesRows());
  const spec = buildDashboard(ds);

  it("emits KPI cards including row count and a numeric total", () => {
    const labels = spec.kpis.map((k) => k.label);
    expect(labels).toContain("Rows");
    expect(spec.kpis.find((k) => k.label === "Rows")!.value).toBe(60);
    expect(labels.some((l) => l.startsWith("Total"))).toBe(true);
  });

  it("emits a pie for the low-cardinality category", () => {
    const pie = spec.charts.find((c) => c.kind === "pie");
    expect(pie).toBeDefined();
    expect(pie!.title).toContain("region");
  });

  it("emits a histogram for numeric columns", () => {
    const hist = spec.charts.find((c) => c.kind === "histogram");
    expect(hist).toBeDefined();
  });

  it("emits a time series from the date column", () => {
    const line = spec.charts.find((c) => c.kind === "line");
    expect(line).toBeDefined();
    expect(line!.data.length).toBeGreaterThanOrEqual(2);
  });

  it("emits an Excel-style pivot (measure by category)", () => {
    const pivot = spec.charts.find((c) => c.kind === "bar" && c.title.includes(" by "));
    expect(pivot).toBeDefined();
  });

  it("caps the chart count", () => {
    expect(spec.charts.length).toBeLessThanOrEqual(12);
  });

  it("produces plain-language insights (correlation present)", () => {
    expect(spec.insights.length).toBeGreaterThan(0);
    expect(spec.insights.some((i) => i.includes("move together"))).toBe(true);
  });

  it("survives a dataset with no numeric or date columns", () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ tag: `t${i % 3}` }));
    const small = buildDashboard(makeDataset(rows));
    expect(small.kpis.find((k) => k.label === "Rows")!.value).toBe(12);
    expect(small.charts.some((c) => c.kind === "pie")).toBe(true);
    expect(small.charts.every((c) => c.kind !== "histogram" && c.kind !== "line")).toBe(true);
  });

  it("skips identifier-named columns as measures", () => {
    const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({
      order_id: 1000 + i,
      amount: 50 + i,
    }));
    const s = buildDashboard(makeDataset(rows));
    expect(s.kpis.some((k) => k.label === "Total order_id")).toBe(false);
    expect(s.kpis.some((k) => k.label === "Total amount")).toBe(true);
  });
});
