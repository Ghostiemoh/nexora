import { describe, it, expect } from "vitest";
import { diffPeriods, CATEGORY_COMPARE_CAP } from "./period-diff";
import { profileDataset } from "./profile";
import type { Row, Dataset } from "./types";

function makeDataset(name: string, rows: Row[]): Dataset {
  return profileDataset({
    id: name,
    name,
    columns: Object.keys(rows[0] ?? {}),
    rows,
    createdAt: 1,
    changelog: [],
  });
}

const september: Row[] = [
  { date: "2026-09-01", region: "EMEA", revenue: 1000, customer: "acme" },
  { date: "2026-09-02", region: "APAC", revenue: 1000, customer: "globex" },
  { date: "2026-09-03", region: "EMEA", revenue: 1000, customer: "initech" },
  { date: "2026-09-04", region: "APAC", revenue: 1000, customer: "acme" },
];

/** October: revenue up 25% in total, one extra row, a new region. */
const october: Row[] = [
  { date: "2026-10-01", region: "EMEA", revenue: 1000, customer: "acme" },
  { date: "2026-10-02", region: "APAC", revenue: 1000, customer: "globex" },
  { date: "2026-10-03", region: "EMEA", revenue: 1500, customer: "initech" },
  { date: "2026-10-04", region: "LATAM", revenue: 1000, customer: "acme" },
  { date: "2026-10-05", region: "EMEA", revenue: 500, customer: "hooli" },
];

const prev = makeDataset("Sales September", september);
const curr = makeDataset("Sales October", october);

/* Revenue arriving as banded labels rather than figures. `$1,200` would not
 * count as drift: Nexora reads currency-formatted cells as numbers by design. */
const revenueAsBands = makeDataset(
  "Oct",
  october.map((r, i) => ({ ...r, revenue: ["high", "low", "mid", "flat", "high"][i] }))
);

describe("diffPeriods row and health movement", () => {
  const diff = diffPeriods(prev, curr);

  it("names both sides so the reader knows what is being compared", () => {
    expect(diff.previousName).toBe("Sales September");
    expect(diff.currentName).toBe("Sales October");
  });

  it("reports the row count change as a count and a percentage", () => {
    expect(diff.rowsBefore).toBe(4);
    expect(diff.rowsAfter).toBe(5);
    expect(diff.rowChangePct).toBeCloseTo(25, 5);
  });

  it("reports the health score movement", () => {
    expect(diff.healthBefore).toBe(prev.health.overall);
    expect(diff.healthAfter).toBe(curr.health.overall);
  });

  it("leaves the row percentage null rather than dividing by an empty previous file", () => {
    const empty = makeDataset("Empty", []);
    expect(diffPeriods(empty, curr).rowChangePct).toBeNull();
  });
});

describe("diffPeriods schema drift", () => {
  it("finds no drift between two exports of the same shape", () => {
    const diff = diffPeriods(prev, curr);
    expect(diff.addedColumns).toEqual([]);
    expect(diff.removedColumns).toEqual([]);
    expect(diff.retypedColumns).toEqual([]);
    expect(diff.schemaChanged).toBe(false);
  });

  it("names a column that appeared this month", () => {
    const withExtra = makeDataset("Oct", october.map((r) => ({ ...r, discount: 5 })));
    const diff = diffPeriods(prev, withExtra);
    expect(diff.addedColumns).toEqual(["discount"]);
    expect(diff.schemaChanged).toBe(true);
  });

  it("names a column that stopped arriving", () => {
    const withoutCustomer = makeDataset(
      "Oct",
      october.map((r) => ({ date: r.date, region: r.region, revenue: r.revenue }))
    );
    const diff = diffPeriods(prev, withoutCustomer);
    expect(diff.removedColumns).toEqual(["customer"]);
    expect(diff.schemaChanged).toBe(true);
  });

  it("flags a column that changed type, which is what silently breaks totals", () => {
    const diff = diffPeriods(prev, revenueAsBands);
    expect(diff.retypedColumns).toHaveLength(1);
    expect(diff.retypedColumns[0].column).toBe("revenue");
    expect(diff.retypedColumns[0].from).toBe("number");
    expect(diff.retypedColumns[0].to).not.toBe("number");
    expect(diff.schemaChanged).toBe(true);
  });
});

describe("diffPeriods numeric movement", () => {
  const diff = diffPeriods(prev, curr);
  const revenue = diff.numericDeltas.find((d) => d.column === "revenue");

  it("compares the total of each numeric column", () => {
    expect(revenue?.previousTotal).toBe(4000);
    expect(revenue?.currentTotal).toBe(5000);
    expect(revenue?.totalChangePct).toBeCloseTo(25, 5);
  });

  it("compares the mean, so a total driven by row count is distinguishable", () => {
    expect(revenue?.previousMean).toBeCloseTo(1000, 5);
    expect(revenue?.currentMean).toBeCloseTo(1000, 5);
    expect(revenue?.meanChangePct).toBeCloseTo(0, 5);
  });

  it("leaves the percentage null when the previous total was zero", () => {
    const zeroed = makeDataset("Sep", september.map((r) => ({ ...r, revenue: 0 })));
    const diff = diffPeriods(zeroed, curr);
    expect(diff.numericDeltas.find((d) => d.column === "revenue")?.totalChangePct).toBeNull();
  });

  it("skips a numeric column that is not in both files", () => {
    const withExtra = makeDataset("Oct", october.map((r) => ({ ...r, discount: 5 })));
    const diff = diffPeriods(prev, withExtra);
    expect(diff.numericDeltas.some((d) => d.column === "discount")).toBe(false);
  });
});

describe("diffPeriods completeness movement", () => {
  it("reports a column that arrived emptier than last month", () => {
    const gappy = makeDataset(
      "Oct",
      october.map((r, i) => ({ ...r, customer: i < 3 ? r.customer : null }))
    );
    const diff = diffPeriods(prev, gappy);
    const customer = diff.completenessDeltas.find((d) => d.column === "customer");

    expect(customer).toBeDefined();
    expect(customer!.delta).toBeLessThan(0);
    expect(customer!.currentCompleteness).toBeLessThan(customer!.previousCompleteness);
  });

  it("stays quiet about columns whose completeness barely moved", () => {
    const diff = diffPeriods(prev, curr);
    expect(diff.completenessDeltas).toEqual([]);
  });
});

describe("diffPeriods category movement", () => {
  it("names a category value that appeared this month", () => {
    const diff = diffPeriods(prev, curr);
    const region = diff.categoryDeltas.find((d) => d.column === "region");
    expect(region?.appeared).toEqual(["LATAM"]);
    expect(region?.disappeared).toEqual([]);
  });

  it("names a category value that stopped appearing", () => {
    const noApac = makeDataset("Oct", october.filter((r) => r.region !== "APAC"));
    const diff = diffPeriods(prev, noApac);
    const region = diff.categoryDeltas.find((d) => d.column === "region");
    expect(region?.disappeared).toEqual(["APAC"]);
  });

  it("does not enumerate a high-cardinality column", () => {
    const wide: Row[] = Array.from({ length: CATEGORY_COMPARE_CAP + 50 }, (_, i) => ({
      date: "2026-10-01",
      region: `region_${i}`,
      revenue: 10,
      customer: `c${i}`,
    }));
    const diff = diffPeriods(prev, makeDataset("Oct", wide));
    expect(diff.categoryDeltas.some((d) => d.column === "region")).toBe(false);
  });
});

describe("diffPeriods narrative", () => {
  it("writes what changed in plain sentences", () => {
    const diff = diffPeriods(prev, curr);
    expect(diff.narrative.length).toBeGreaterThan(0);
    expect(diff.narrative.join(" ")).toMatch(/revenue/i);
  });

  it("leads with schema drift, because that is what invalidates the comparison", () => {
    const diff = diffPeriods(prev, revenueAsBands);
    expect(diff.narrative[0]).toMatch(/revenue/i);
    expect(diff.narrative[0]).toMatch(/type|text|number/i);
  });

  it("says so plainly when nothing of substance moved", () => {
    const diff = diffPeriods(prev, makeDataset("Sales September copy", september));
    expect(diff.narrative).toEqual(["Nothing of substance changed between the two files."]);
  });

  it("never throws on two empty datasets", () => {
    const empty = makeDataset("Empty", []);
    expect(() => diffPeriods(empty, empty)).not.toThrow();
  });
});
