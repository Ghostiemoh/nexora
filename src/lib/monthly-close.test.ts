/* The loop the product is built around, tested as one pipeline rather than as
 * three separate units: clean September by hand, drop in October, have Nexora
 * recognize it, replay the recorded cleanup, and report what moved.
 *
 * This is the test that fails if the wedge stops working, even when every
 * individual module still passes. */

import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import { replayRecipe } from "./recipe";
import { findRecurringSource } from "./fingerprint";
import { diffPeriods } from "./period-diff";
import type { CleanOp, Dataset, Row } from "./types";

function build(name: string, rows: Row[], recipe?: CleanOp[]): Dataset {
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

/** The mess the README describes: a stray index column, whitespace, mojibake,
 *  inconsistent casing, and a duplicated row. */
const septemberRaw: Row[] = [
  { "": 0, "Order Date": "2026-09-01", Region: " EMEA ", Rep: "john adams", Revenue: 1000 },
  { "": 1, "Order Date": "2026-09-02", Region: "emea", Rep: "JAMES MONROE", Revenue: 1000 },
  { "": 2, "Order Date": "2026-09-03", Region: "APAC", Rep: "Ada Lovelaceâ€“Byron", Revenue: 1000 },
  { "": 3, "Order Date": "2026-09-03", Region: "APAC", Rep: "Ada Lovelaceâ€“Byron", Revenue: 1000 },
];

/** October: the same export, the same mess, one new region, more revenue. */
const octoberRaw: Row[] = [
  { "": 0, "Order Date": "2026-10-01", Region: " EMEA ", Rep: "john adams", Revenue: 1200 },
  { "": 1, "Order Date": "2026-10-02", Region: "emea", Rep: "JAMES MONROE", Revenue: 1300 },
  { "": 2, "Order Date": "2026-10-03", Region: "LATAM", Rep: "Ada Lovelaceâ€“Byron", Revenue: 1500 },
  { "": 3, "Order Date": "2026-10-03", Region: "LATAM", Rep: "Ada Lovelaceâ€“Byron", Revenue: 1500 },
];

/** What an analyst clicked through in Dataset Doctor last month. */
const septemberOps: CleanOp[] = [
  { kind: "dropColumn", column: "" },
  { kind: "trimWhitespace" },
  { kind: "fixEncoding" },
  { kind: "standardizeCase", column: "Region" },
  { kind: "dropDuplicates" },
];

/** Replay a recipe and re-profile, which is what the store does on apply. */
function replayInto(dataset: Dataset, ops: CleanOp[], name: string): Dataset {
  const result = replayRecipe(dataset.rows, dataset.columns, ops);
  const next = profileDataset({
    id: `${dataset.id}-closed`,
    name,
    columns: result.columns,
    rows: result.rows,
    createdAt: dataset.createdAt,
    changelog: [],
  });
  next.recipe = ops;
  return next;
}

describe("the monthly close, end to end", () => {
  const september = replayInto(build("Sales September", septemberRaw), septemberOps, "Sales September");
  const october = build("Sales October", octoberRaw);

  it("cleaned September the way the analyst asked", () => {
    expect(september.columns).not.toContain("");
    expect(september.rows).toHaveLength(3); // the duplicate collapsed
    expect(september.rows.every((r) => !String(r.Rep).includes("â€“"))).toBe(true);
  });

  it("recognizes October as another copy of September", () => {
    const found = findRecurringSource(october, [september, october]);
    expect(found).not.toBeNull();
    expect(found!.dataset.name).toBe("Sales September");
    expect(found!.match.score).toBeGreaterThanOrEqual(70);
  });

  it("replays the recorded cleanup onto October with no new decisions", () => {
    const found = findRecurringSource(october, [september, october])!;
    const closed = replayInto(october, found.dataset.recipe!, "Sales October");

    expect(closed.columns).toEqual(september.columns);
    expect(closed.rows).toHaveLength(3);
    expect(closed.rows.every((r) => !String(r.Rep).includes("â€“"))).toBe(true);
    // Same sequence in, same shape out: that is the whole promise.
    expect(closed.recipe).toEqual(september.recipe);
  });

  it("reports what moved, and stays quiet about what did not", () => {
    const found = findRecurringSource(october, [september, october])!;
    const closed = replayInto(october, found.dataset.recipe!, "Sales October");
    const diff = diffPeriods(september, closed);

    expect(diff.schemaChanged).toBe(false);

    const revenue = diff.numericDeltas.find((d) => d.column === "Revenue");
    expect(revenue?.previousTotal).toBe(3000);
    expect(revenue?.currentTotal).toBe(4000);
    expect(revenue?.totalChangePct).toBeCloseTo(33.333, 2);

    // standardizeCase title-cases, so the cleaned values are Emea/Apac/Latam.
    const region = diff.categoryDeltas.find((d) => d.column === "Region");
    expect(region?.appeared).toEqual(["Latam"]);
    expect(region?.disappeared).toEqual(["Apac"]);

    const prose = diff.narrative.join(" ");
    expect(prose).toMatch(/Revenue/);
    expect(prose).toMatch(/Latam/);
  });

  it("replays cleanly even when a column stopped arriving", () => {
    const noRep = build(
      "Sales October",
      octoberRaw.map((r) => ({
        "": r[""],
        "Order Date": r["Order Date"],
        Region: r.Region,
        Revenue: r.Revenue,
      }))
    );

    const found = findRecurringSource(noRep, [september, noRep]);
    expect(found).not.toBeNull();

    // The op targeting the missing column is skipped rather than fatal.
    const result = replayRecipe(noRep.rows, noRep.columns, found!.dataset.recipe!);
    expect(result.applied).toBeGreaterThan(0);

    const closed = replayInto(noRep, found!.dataset.recipe!, "Sales October");
    expect(diffPeriods(september, closed).removedColumns).toEqual(["Rep"]);
  });
});
