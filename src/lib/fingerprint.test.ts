import { describe, it, expect } from "vitest";
import {
  normalizeColumnName,
  fingerprintDataset,
  compareFingerprints,
  isRecurringMatch,
  findRecurringSource,
  RECURRING_MATCH_THRESHOLD,
} from "./fingerprint";
import { profileDataset } from "./profile";
import type { Row, Dataset, CleanOp } from "./types";

/** An export of the shape Nexora is built for: a few typed columns, some mess. */
function makeDataset(name: string, rows: Row[], recipe?: CleanOp[]): Dataset {
  const ds = profileDataset({
    id: name,
    name,
    columns: Object.keys(rows[0] ?? {}),
    rows,
    createdAt: 1,
    changelog: [],
  });
  if (recipe) ds.recipe = recipe;
  return ds;
}

const september: Row[] = [
  { "Order Date": "2026-09-01", Region: "EMEA", Revenue: 1200, Customer: "acme" },
  { "Order Date": "2026-09-02", Region: "APAC", Revenue: 900, Customer: "globex" },
  { "Order Date": "2026-09-03", Region: "EMEA", Revenue: 1500, Customer: "initech" },
  { "Order Date": "2026-09-04", Region: "APAC", Revenue: 300, Customer: "acme" },
];

describe("normalizeColumnName", () => {
  it("collapses the separator and casing differences exports drift between", () => {
    expect(normalizeColumnName("Order Date")).toBe("order date");
    expect(normalizeColumnName("order_date")).toBe("order date");
    expect(normalizeColumnName("ORDER-DATE")).toBe("order date");
    expect(normalizeColumnName("  Order   Date  ")).toBe("order date");
  });

  it("keeps genuinely different names apart", () => {
    expect(normalizeColumnName("order_date")).not.toBe(normalizeColumnName("ship_date"));
  });

  it("survives a column named only in punctuation", () => {
    expect(normalizeColumnName("---")).toBe("---");
    expect(normalizeColumnName("")).toBe("");
  });
});

describe("fingerprintDataset", () => {
  it("records normalized names in a stable order regardless of column order", () => {
    const a = makeDataset("a", september);
    const reordered: Row[] = september.map((r) => ({
      Revenue: r.Revenue,
      Customer: r.Customer,
      Region: r.Region,
      "Order Date": r["Order Date"],
    }));
    const b = makeDataset("b", reordered);

    expect(fingerprintDataset(a).columns).toEqual(fingerprintDataset(b).columns);
  });

  it("carries the inferred type per column", () => {
    const fp = fingerprintDataset(makeDataset("a", september));
    expect(fp.types["revenue"]).toBe("number");
  });
});

describe("compareFingerprints", () => {
  const base = fingerprintDataset(makeDataset("september", september));

  it("scores an identical schema at 100", () => {
    const match = compareFingerprints(base, base);
    expect(match.score).toBe(100);
    expect(match.added).toEqual([]);
    expect(match.missing).toEqual([]);
    expect(match.retyped).toEqual([]);
    expect(isRecurringMatch(match)).toBe(true);
  });

  it("recognizes the same export after a separator or casing rename", () => {
    const renamed: Row[] = september.map((r) => ({
      order_date: r["Order Date"],
      REGION: r.Region,
      revenue: r.Revenue,
      customer: r.Customer,
    }));
    const match = compareFingerprints(base, fingerprintDataset(makeDataset("october", renamed)));
    expect(match.score).toBe(100);
    expect(isRecurringMatch(match)).toBe(true);
  });

  it("still matches when one column is added, and names the new column", () => {
    const withExtra: Row[] = september.map((r) => ({ ...r, "Discount Code": "SAVE10" }));
    const match = compareFingerprints(base, fingerprintDataset(makeDataset("october", withExtra)));

    expect(isRecurringMatch(match)).toBe(true);
    expect(match.score).toBeLessThan(100);
    expect(match.added).toEqual(["Discount Code"]);
    expect(match.missing).toEqual([]);
  });

  it("still matches when one column disappears, and names it", () => {
    const withoutCustomer: Row[] = september.map((r) => ({
      "Order Date": r["Order Date"],
      Region: r.Region,
      Revenue: r.Revenue,
    }));
    const match = compareFingerprints(
      base,
      fingerprintDataset(makeDataset("october", withoutCustomer))
    );

    expect(isRecurringMatch(match)).toBe(true);
    expect(match.missing).toEqual(["Customer"]);
    expect(match.added).toEqual([]);
  });

  it("reports a column that changed type without losing the match", () => {
    /* Revenue arrives as banded labels this month instead of figures, which is
     * the drift that silently breaks a total. Note that `$1,200` would NOT
     * count: Nexora reads currency-formatted cells as numbers by design. */
    const bands = ["high", "low", "mid", "flat"];
    const revenueAsText: Row[] = september.map((r, i) => ({ ...r, Revenue: bands[i] }));
    const match = compareFingerprints(
      base,
      fingerprintDataset(makeDataset("october", revenueAsText))
    );

    expect(match.retyped).toHaveLength(1);
    expect(match.retyped[0].column).toBe("Revenue");
    expect(match.retyped[0].from).toBe("number");
    expect(match.retyped[0].to).not.toBe("number");
    expect(match.score).toBeLessThan(100);
  });

  it("refuses to match an unrelated export", () => {
    const unrelated: Row[] = [
      { employee_id: 1, department: "Legal", salary: 90000 },
      { employee_id: 2, department: "Ops", salary: 70000 },
    ];
    const match = compareFingerprints(base, fingerprintDataset(makeDataset("hr", unrelated)));

    expect(match.score).toBe(0);
    expect(isRecurringMatch(match)).toBe(false);
  });

  it("refuses to match on names alone when every type disagrees", () => {
    // Same headers, entirely different content underneath: not last month's file.
    const allDisagree: Row[] = [
      { "Order Date": 701, Region: 12, Revenue: "alpha", Customer: 55 },
      { "Order Date": 802, Region: 34, Revenue: "beta", Customer: 66 },
      { "Order Date": 903, Region: 56, Revenue: "gamma", Customer: 77 },
      { "Order Date": 964, Region: 78, Revenue: "delta", Customer: 88 },
    ];
    const match = compareFingerprints(base, fingerprintDataset(makeDataset("junk", allDisagree)));

    expect(match.score).toBeLessThan(RECURRING_MATCH_THRESHOLD);
    expect(isRecurringMatch(match)).toBe(false);
  });

  it("scores an empty schema at zero rather than dividing by nothing", () => {
    const empty = { version: 1 as const, columns: [], types: {}, labels: {} };
    expect(compareFingerprints(empty, empty).score).toBe(0);
    expect(compareFingerprints(base, empty).score).toBe(0);
  });
});

describe("findRecurringSource", () => {
  const recipe: CleanOp[] = [{ kind: "trimWhitespace" }, { kind: "dropDuplicates" }];

  it("finds last month's file and reports why it matched", () => {
    const last = makeDataset("Sales September", september, recipe);
    const current = makeDataset("Sales October", september);

    const found = findRecurringSource(current, [last, current]);
    expect(found?.dataset.name).toBe("Sales September");
    expect(found?.match.score).toBe(100);
    expect(found?.dataset.recipe).toEqual(recipe);
  });

  it("never matches a dataset against itself", () => {
    const only = makeDataset("Sales October", september, recipe);
    expect(findRecurringSource(only, [only])).toBeNull();
  });

  it("ignores candidates that have no recipe to replay", () => {
    const noRecipe = makeDataset("Sales September", september);
    const current = makeDataset("Sales October", september);
    expect(findRecurringSource(current, [noRecipe, current])).toBeNull();
  });

  it("prefers the highest-scoring candidate", () => {
    const exact = makeDataset("Sales September", september, recipe);
    const looser = makeDataset(
      "Sales August",
      september.map((r) => ({ ...r, Extra: 1, Another: 2 })),
      recipe
    );
    const current = makeDataset("Sales October", september);

    expect(findRecurringSource(current, [looser, exact, current])?.dataset.name).toBe(
      "Sales September"
    );
  });

  it("breaks a score tie toward the most recently updated candidate", () => {
    const older = makeDataset("Sales July", september, recipe);
    older.updatedAt = 1_000;
    const newer = makeDataset("Sales September", september, recipe);
    newer.updatedAt = 9_000;
    const current = makeDataset("Sales October", september);

    expect(findRecurringSource(current, [older, newer, current])?.dataset.name).toBe(
      "Sales September"
    );
  });

  it("does not penalize the candidate for columns the recipe itself deletes", () => {
    /* The stored source is the cleaned file; the one just imported is still raw.
     * The leftover index column is what the recipe is for, so it must not count
     * as drift — with a second drift on top, that penalty alone would push a
     * genuine repeat below the threshold. */
    const cleaned = makeDataset("Sales September", september, [
      { kind: "dropColumn", column: "__index" },
      { kind: "trimWhitespace" },
    ]);
    const rawWithIndexAndOneLoss: Row[] = september.map((r, i) => ({
      __index: i,
      "Order Date": r["Order Date"],
      Region: r.Region,
      Revenue: r.Revenue,
    }));
    const current = makeDataset("Sales October", rawWithIndexAndOneLoss);

    const found = findRecurringSource(current, [cleaned, current]);
    expect(found?.dataset.name).toBe("Sales September");
    expect(found?.match.added).toEqual([]);
    expect(found?.match.missing).toEqual(["Customer"]);
  });

  it("returns null when nothing clears the threshold", () => {
    const hr = makeDataset(
      "Headcount",
      [
        { employee_id: 1, department: "Legal", salary: 90000 },
        { employee_id: 2, department: "Ops", salary: 70000 },
      ],
      recipe
    );
    const current = makeDataset("Sales October", september);
    expect(findRecurringSource(current, [hr, current])).toBeNull();
  });
});
