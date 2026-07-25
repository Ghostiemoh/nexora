import { describe, it, expect } from "vitest";
import { buildRecipe, serializeRecipe, parseRecipe, replayRecipe, previewCleanOp } from "./recipe";
import { buildDashboard } from "./auto-dashboard";
import { profileDataset } from "./profile";
import type { Row, CleanOp } from "./types";

describe("recipe round-trip", () => {
  const ops: CleanOp[] = [
    { kind: "fixEncoding" },
    { kind: "trimWhitespace" },
    { kind: "mergeValues", column: "party", mapping: { Demorcatic: "Democratic" } },
    { kind: "dropColumn", column: "__EMPTY" },
  ];

  it("serializes and parses back identically", () => {
    const json = serializeRecipe(buildRecipe("presidents.xlsx", ops));
    const parsed = parseRecipe(json);
    expect(parsed.ops).toEqual(ops);
    expect(parsed.source).toBe("presidents.xlsx");
  });

  it("rejects invalid payloads with readable errors", () => {
    expect(() => parseRecipe("not json")).toThrow("Not valid JSON");
    expect(() => parseRecipe('{"foo": 1}')).toThrow("Not a Nexora recipe");
    expect(() => parseRecipe('{"version":1,"ops":[{"kind":"formatHardDrive"}]}')).toThrow(
      "unknown operation"
    );
  });

  it("replays ops in order and drops columns", () => {
    const rows: Row[] = [
      { __EMPTY: 0, party: "Democratic", name: " a " },
      { __EMPTY: 1, party: "Demorcatic", name: "b" },
    ];
    const result = replayRecipe(rows, ["__EMPTY", "party", "name"], ops);
    expect(result.applied).toBe(4);
    expect(result.skipped).toBe(0);
    expect(result.columns).toEqual(["party", "name"]);
    expect(result.rows[1].party).toBe("Democratic");
    expect(result.rows[0].name).toBe("a");
    expect(result.rows[0].__EMPTY).toBeUndefined();
  });

  it("skips ops whose column is missing (schema drift) instead of failing", () => {
    const rows: Row[] = [{ a: 1 }];
    const result = replayRecipe(rows, ["a"], [
      { kind: "dropColumn", column: "ghost" },
      { kind: "trimWhitespace" },
    ]);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

describe("previewCleanOp", () => {
  it("reports removed rows for dedup", () => {
    const rows: Row[] = [{ a: 1 }, { a: 1 }, { a: 2 }];
    expect(previewCleanOp(rows, { kind: "dropDuplicates" })).toEqual({
      changedCells: 0,
      removedRows: 1,
    });
  });

  it("reports changed cells for whitespace normalization", () => {
    const rows: Row[] = [{ a: " x ", b: "ok" }, { a: "y", b: "z  z" }];
    expect(previewCleanOp(rows, { kind: "trimWhitespace" })).toEqual({
      changedCells: 2,
      removedRows: 0,
    });
  });

  it("reports zero impact for a no-op", () => {
    const rows: Row[] = [{ a: "clean" }];
    expect(previewCleanOp(rows, { kind: "fixEncoding" })).toEqual({
      changedCells: 0,
      removedRows: 0,
    });
  });
});

describe("cross-filter and new insights", () => {
  const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({
    region: i % 4 === 0 ? "North" : i % 4 === 1 ? "South" : i % 4 === 2 ? "East" : "West",
    amount: i % 4 === 0 ? 1000 : 50, // North dominates → Pareto fires
    date: `2024-0${1 + (i % 3)}-10`,
  }));
  const ds = profileDataset({
    id: "t",
    name: "t.csv",
    columns: ["region", "amount", "date"],
    rows,
    createdAt: 0,
    changelog: [],
  });

  it("rowsOverride rebuilds KPIs and charts from the subset", () => {
    const north = rows.filter((r) => r.region === "North");
    const spec = buildDashboard(ds, north);
    expect(spec.kpis.find((k) => k.label === "Rows")!.value).toBe(10);
    expect(spec.kpis.find((k) => k.label === "Total amount")!.value).toBe(10000);
  });

  it("pivot and pie specs carry filterColumn for click-to-filter", () => {
    const spec = buildDashboard(ds);
    const pivot = spec.charts.find((c) => c.kind === "bar" && c.title.includes(" by "));
    const pie = spec.charts.find((c) => c.kind === "pie");
    expect(pivot && "filterColumn" in pivot && pivot.filterColumn).toBe("region");
    expect(pie && "filterColumn" in pie && pie.filterColumn).toBe("region");
  });

  it("emits a Pareto concentration insight when few categories dominate", () => {
    const spec = buildDashboard(ds);
    expect(spec.insights.some((i) => i.startsWith("Pareto:"))).toBe(true);
  });
});
