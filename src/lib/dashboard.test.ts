import { describe, it, expect } from "vitest";
import { buildDashboardLayout, buildFilters, applyFilters, describeFilters } from "./dashboard";
import { compatibleTypes, buildChartSeries } from "./chart-recommend";
import { profileDataset } from "./profile";
import type { Row } from "./types";

function makeDataset(rows: Row[]) {
  return profileDataset({
    id: "d1",
    name: "sales.csv",
    columns: Object.keys(rows[0]),
    rows,
    createdAt: 0,
    changelog: [],
  });
}

function salesRows(n = 120): Row[] {
  const regions = ["West", "East", "North"];
  const products = ["Widget", "Gadget", "Doohickey", "Sprocket"];
  return Array.from({ length: n }, (_, i) => ({
    order_id: `ORD-${i}`,
    region: regions[i % 3],
    product: products[i % 4],
    revenue: 200 + (i % 12) * 30,
    cost: 80 + (i % 12) * 12,
    order_date: `2026-0${1 + (i % 6)}-${String((i % 27) + 1).padStart(2, "0")}`,
  }));
}

describe("buildDashboardLayout", () => {
  const ds = makeDataset(salesRows());
  const { panels } = buildDashboardLayout(ds);

  it("leads with the trend when the data has a date column", () => {
    expect(panels[0].config.x).toBe("order_date");
    expect(panels[0].wide).toBe(true);
  });

  it("breaks the lead measure down by a dimension", () => {
    const driver = panels.find((p) => p.id.startsWith("driver_"));
    expect(driver?.config.y).toBe("revenue");
    expect(driver?.config.agg).toBe("sum");
  });

  it("only emits panels that can actually be rendered", () => {
    for (const panel of panels) {
      const availability = compatibleTypes(ds, panel.config).find((t) => t.type === panel.config.type);
      expect(availability?.ok, `${panel.id} (${panel.config.type})`).toBe(true);
      expect(buildChartSeries(ds, panel.config), panel.id).not.toBeNull();
    }
  });

  it("never repeats the same column pairing twice", () => {
    const keys = panels.map((p) => `${p.config.x}|${p.config.y}|${p.config.series}|${p.config.type}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("caps the panel count so the page stays readable", () => {
    expect(panels.length).toBeLessThanOrEqual(8);
    expect(panels.length).toBeGreaterThan(2);
  });

  it("degrades to whatever a thin dataset supports without crashing", () => {
    const thin = makeDataset([
      { label: "a", score: 1 },
      { label: "b", score: 2 },
      { label: "c", score: 3 },
    ]);
    const layout = buildDashboardLayout(thin);
    expect(Array.isArray(layout.panels)).toBe(true);
    for (const panel of layout.panels) {
      expect(buildChartSeries(thin, panel.config), panel.id).not.toBeNull();
    }
  });

  it("gives every panel a title and a plain-language subtitle", () => {
    for (const panel of panels) {
      expect(panel.title.length).toBeGreaterThan(0);
      expect(panel.subtitle.length).toBeGreaterThan(0);
    }
  });
});

describe("filters", () => {
  const ds = makeDataset(salesRows());

  it("offers dimensions with a workable number of values", () => {
    const filters = buildFilters(ds);
    const columns = filters.map((f) => f.column);
    expect(columns).toContain("region");
    expect(columns).not.toContain("order_id");
    for (const filter of filters) {
      expect(filter.values.length).toBeGreaterThan(1);
    }
  });

  it("treats an empty selection as no filter at all", () => {
    expect(applyFilters(ds.rows, {})).toHaveLength(ds.rows.length);
    expect(applyFilters(ds.rows, { region: [] })).toHaveLength(ds.rows.length);
  });

  it("intersects selections across columns", () => {
    const filtered = applyFilters(ds.rows, { region: ["West"], product: ["Widget"] });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.region === "West" && r.product === "Widget")).toBe(true);
  });

  it("unions selections within one column", () => {
    const filtered = applyFilters(ds.rows, { region: ["West", "East"] });
    expect(filtered.every((r) => r.region === "West" || r.region === "East")).toBe(true);
    expect(filtered.length).toBeGreaterThan(applyFilters(ds.rows, { region: ["West"] }).length);
  });

  it("captions the active filter state", () => {
    expect(describeFilters({ region: ["West"], product: [] })).toBe("Region: West");
    expect(describeFilters({})).toBe("");
  });
});
