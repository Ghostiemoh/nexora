import { describe, it, expect } from "vitest";
import { buildKpis, comparePeriods, formatKpiValue, titleize, pluralize } from "./kpi";
import { readSemantics, roleOf, detectCurrency, normalizeName } from "./semantics";
import { profileDataset } from "./profile";
import type { Row } from "./types";

function makeDataset(rows: Row[], name = "data.csv") {
  return profileDataset({
    id: "k1",
    name,
    columns: Object.keys(rows[0]),
    rows,
    createdAt: 0,
    changelog: [],
  });
}

/** A commerce extract: revenue, cost, orders, customers, status, dates. */
function makeSalesRows(n = 120): Row[] {
  const rows: Row[] = [];
  const regions = ["West", "East", "North"];
  for (let i = 0; i < n; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = i < n / 2 ? "01" : "03";
    rows.push({
      order_id: `ORD-${1000 + i}`,
      customer_id: `CUST-${i % 25}`,
      region: regions[i % 3],
      revenue: 100 + (i % 10) * 25,
      cost: 40 + (i % 10) * 10,
      quantity: 1 + (i % 5),
      status: i % 4 === 0 ? "Cancelled" : "Completed",
      order_date: `2026-${month}-${day}`,
    });
  }
  return rows;
}

describe("semantics", () => {
  it("reads business roles out of column names in any casing convention", () => {
    expect(roleOf("Total_Revenue")).toBe("revenue");
    expect(roleOf("totalRevenue")).toBe("revenue");
    expect(roleOf("gross profit")).toBe("profit");
    expect(roleOf("unit-cost")).toBe("cost");
    expect(roleOf("Qty")).toBe("quantity");
    expect(roleOf("customer_id")).toBe("customer");
    expect(roleOf("Order No")).toBe("order");
    expect(roleOf("Region")).toBe("region");
  });

  it("returns no role for a column with no business meaning", () => {
    expect(roleOf("latency_ms")).toBeNull();
    expect(roleOf("xyz")).toBeNull();
  });

  it("normalises separators and camelCase alike", () => {
    expect(normalizeName("totalRevenueUSD")).toBe("total revenue usd");
    expect(normalizeName("total_revenue")).toBe("total revenue");
  });

  it("detects a currency symbol only when the data uses one consistently", () => {
    const naira: Row[] = Array.from({ length: 5 }, () => ({ amount: "₦1,200" }));
    expect(detectCurrency(naira, "amount")).toBe("₦");

    const mixed: Row[] = [{ amount: "$5" }, { amount: "€5" }, { amount: "$5" }];
    expect(detectCurrency(mixed, "amount")).toBeNull();

    const plain: Row[] = Array.from({ length: 5 }, () => ({ amount: 1200 }));
    expect(detectCurrency(plain, "amount")).toBeNull();
  });

  it("classifies measures and dimensions from a sales extract", () => {
    const sem = readSemantics(makeDataset(makeSalesRows()));
    expect(sem.measures.revenue?.[0].name).toBe("revenue");
    expect(sem.measures.cost?.[0].name).toBe("cost");
    expect(sem.dimensions.customer?.[0].name).toBe("customer_id");
    expect(sem.primaryDate).toBe("order_date");
  });
});

describe("comparePeriods", () => {
  it("splits into two equal-length windows so neither side is partial", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 60; i++) {
      rows.push({ d: `2026-0${1 + Math.floor(i / 30)}-${String((i % 30) + 1).padStart(2, "0")}`, v: 1 });
    }
    const result = comparePeriods(rows, "d");
    expect(result).not.toBeNull();
    expect(result!.current.length).toBeGreaterThan(0);
    expect(result!.previous.length).toBeGreaterThan(0);
    expect(result!.currentLabel).toMatch(/→/);
  });

  it("returns null when there is not enough history to compare", () => {
    const rows: Row[] = [{ d: "2026-01-01" }, { d: "2026-01-01" }];
    expect(comparePeriods(rows, "d")).toBeNull();
  });
});

describe("buildKpis", () => {
  const ds = makeDataset(makeSalesRows());
  const { kpis } = buildKpis(ds);
  const labels = kpis.map((k) => k.label);

  it("never puts row or column counts on the KPI row", () => {
    expect(labels).not.toContain("Rows");
    expect(labels).not.toContain("Columns");
    expect(labels.join(" ")).not.toMatch(/health score/i);
  });

  it("leads with the money measures the dataset actually has", () => {
    expect(labels[0]).toBe("Total Revenue");
    expect(labels).toContain("Profit Margin");
  });

  it("derives gross profit when there is revenue and cost but no profit column", () => {
    const profit = kpis.find((k) => k.id === "derived_profit");
    expect(profit).toBeDefined();
    // 120 rows: revenue sum minus cost sum, computed independently here.
    const rows = makeSalesRows();
    const expected =
      rows.reduce((s, r) => s + Number(r.revenue), 0) - rows.reduce((s, r) => s + Number(r.cost), 0);
    expect(profit!.value).toBeCloseTo(expected, 6);
  });

  it("counts distinct keys rather than rows for entity KPIs", () => {
    const customers = kpis.find((k) => k.id === "customers");
    expect(customers?.value).toBe(25);
    expect(customers?.label).toBe("Customers");
  });

  it("marks cost-style measures as lower-is-better", () => {
    const { kpis: costFirst } = buildKpis(
      makeDataset(makeSalesRows().map((r) => ({ cost: r.cost, dept: r.region })))
    );
    const cost = costFirst.find((k) => k.id === "cost");
    expect(cost?.higherIsBetter).toBe(false);
  });

  it("caps the row at six tiles", () => {
    expect(kpis.length).toBeLessThanOrEqual(6);
  });

  it("omits KPIs the data cannot support instead of showing zeroes", () => {
    const bare = makeDataset([
      { note: "alpha", tag: "x" },
      { note: "beta", tag: "y" },
      { note: "gamma", tag: "x" },
    ]);
    const { kpis: bareKpis } = buildKpis(bare);
    expect(bareKpis.every((k) => k.label !== "Total Revenue")).toBe(true);
    expect(bareKpis.every((k) => Number.isFinite(k.value))).toBe(true);
  });

  it("still produces a headline for a dataset with no business vocabulary", () => {
    const sensor = makeDataset(
      Array.from({ length: 30 }, (_, i) => ({ sensor: `S${i % 3}`, reading: i * 1.5 }))
    );
    const { kpis: sensorKpis } = buildKpis(sensor);
    expect(sensorKpis.length).toBeGreaterThan(0);
    expect(sensorKpis.map((k) => k.label)).toContain("Total Reading");
  });

  it("recomputes against a filtered subset when one is supplied", () => {
    const west = ds.rows.filter((r) => r.region === "West");
    const { kpis: filtered } = buildKpis(ds, west);
    const total = filtered.find((k) => k.id === "revenue")!.value;
    const full = kpis.find((k) => k.id === "revenue")!.value;
    expect(total).toBeLessThan(full);
    expect(total).toBeCloseTo(west.reduce((s, r) => s + Number(r.revenue), 0), 6);
  });

  it("reports conversion rate from an outcome column", () => {
    const pipeline = makeDataset(
      Array.from({ length: 40 }, (_, i) => ({
        customer_id: `C-${i % 20}`,
        region: i % 2 === 0 ? "West" : "East",
        status: i % 4 === 0 ? "Won" : "Lost",
      }))
    );
    const conversion = buildKpis(pipeline).kpis.find((k) => k.id === "conversion");
    expect(conversion?.format).toBe("percent");
    expect(conversion!.value).toBeCloseTo(25, 6);
  });
});

describe("formatting", () => {
  it("prefixes money with the detected symbol and compacts large values", () => {
    const spec = {
      id: "x", label: "Total Revenue", value: 1_250_000, format: "currency" as const,
      higherIsBetter: true, formula: "SUM(revenue)",
    };
    expect(formatKpiValue(spec, "₦")).toBe("₦1.3M");
    expect(formatKpiValue({ ...spec, value: 1234.5 }, "$")).toBe("$1,234.50");
  });

  it("renders percentages to one decimal", () => {
    expect(
      formatKpiValue(
        { id: "m", label: "Margin", value: 42.37, format: "percent", higherIsBetter: true, formula: "" },
        null
      )
    ).toBe("42.4%");
  });

  it("titleizes headers and can drop identifier suffixes", () => {
    expect(titleize("total_revenue")).toBe("Total Revenue");
    expect(titleize("customer_id", true)).toBe("Customer");
  });

  it("keeps acronyms upper case instead of title casing them", () => {
    expect(titleize("api_calls")).toBe("API Calls");
    expect(titleize("gmv_usd")).toBe("GMV USD");
  });

  it("pluralizes entity labels", () => {
    expect(pluralize("Customer")).toBe("Customers");
    expect(pluralize("Class")).toBe("Classes");
    expect(pluralize("Company")).toBe("Companies");
  });
});
