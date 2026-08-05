import { describe, it, expect } from "vitest";
import { headerRuns, repeatsParent } from "@/components/pivot/pivot-grid";

/* The header-merging rules the grid renders with. A parent label spans its
 * children instead of repeating, which is the whole reason a nested pivot is
 * readable at a glance. */

const NESTED = [
  ["Q1", "Store"],
  ["Q1", "Web"],
  ["Q2", "Store"],
  ["Q2", "Web"],
  ["Q3", "Web"],
];

describe("headerRuns", () => {
  it("merges the top level into one run per parent", () => {
    expect(headerRuns(NESTED, 0)).toEqual([
      { label: "Q1", span: 2, at: 0 },
      { label: "Q2", span: 2, at: 2 },
      { label: "Q3", span: 1, at: 4 },
    ]);
  });

  it("leaves the deepest level unmerged", () => {
    expect(headerRuns(NESTED, 1).map((r) => r.span)).toEqual([1, 1, 1, 1, 1]);
    expect(headerRuns(NESTED, 1).map((r) => r.label)).toEqual([
      "Store",
      "Web",
      "Store",
      "Web",
      "Web",
    ]);
  });

  it("spans covering every column, so the header stays square", () => {
    const total = headerRuns(NESTED, 0).reduce((sum, run) => sum + run.span, 0);
    expect(total).toBe(NESTED.length);
  });

  it("handles a single flat level", () => {
    expect(headerRuns([["Q1"], ["Q2"]], 0)).toEqual([
      { label: "Q1", span: 1, at: 0 },
      { label: "Q2", span: 1, at: 1 },
    ]);
  });

  it("does not merge two distant parents that happen to share a name", () => {
    const runs = headerRuns([["A", "x"], ["B", "y"], ["A", "z"]], 0);
    expect(runs.map((r) => r.label)).toEqual(["A", "B", "A"]);
    expect(runs.every((r) => r.span === 1)).toBe(true);
  });

  it("returns nothing for an empty grid", () => {
    expect(headerRuns([], 0)).toEqual([]);
  });
});

describe("repeatsParent", () => {
  const ROWS = [
    ["East", "Akron"],
    ["East", "Erie"],
    ["West", "Boise"],
    ["West", "Reno"],
  ];

  it("never blanks the first row", () => {
    expect(repeatsParent(ROWS, 0, 0)).toBe(false);
  });

  it("blanks a parent label that repeats the row above", () => {
    expect(repeatsParent(ROWS, 1, 0)).toBe(true);
  });

  it("writes the parent again when it changes", () => {
    expect(repeatsParent(ROWS, 2, 0)).toBe(false);
  });

  it("never blanks the deepest level, where every value differs", () => {
    for (let i = 0; i < ROWS.length; i++) {
      expect(repeatsParent(ROWS, i, 1)).toBe(false);
    }
  });
});
