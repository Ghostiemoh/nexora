import { describe, it, expect } from "vitest";
import { joinDatasets } from "./joiner";
import type { Row } from "./types";

const left: Row[] = [
  { k: "a", lv: 1 },
  { k: null, lv: 2 },
];
const right: Row[] = [
  { k: "a", rv: 10 },
  { k: null, rv: 20 },
];

describe("joinDatasets", () => {
  it("inner join matches on key and NEVER joins null to null", () => {
    const { rows } = joinDatasets(left, ["k", "lv"], right, ["k", "rv"], "k", "k", "inner");
    expect(rows).toHaveLength(1);
    expect(rows[0].lv).toBe(1);
    expect(rows[0].rv).toBe(10);
  });

  it("left join keeps unmatched (incl. null-key) left rows", () => {
    const { rows } = joinDatasets(left, ["k", "lv"], right, ["k", "rv"], "k", "k", "left");
    expect(rows).toHaveLength(2);
    const nullRow = rows.find((r) => r.lv === 2)!;
    expect(nullRow.rv).toBeNull();
  });

  it("full join keeps unmatched rows from both sides", () => {
    const { rows } = joinDatasets(left, ["k", "lv"], right, ["k", "rv"], "k", "k", "full");
    // 1 matched + 1 left-only (null key) + 1 right-only (null key)
    expect(rows).toHaveLength(3);
  });

  it("handles duplicate matching keys as a product without index bugs", () => {
    const l: Row[] = [{ k: "x", lv: 1 }];
    const r: Row[] = [
      { k: "x", rv: 1 },
      { k: "x", rv: 2 },
    ];
    const { rows } = joinDatasets(l, ["k", "lv"], r, ["k", "rv"], "k", "k", "inner");
    expect(rows).toHaveLength(2);
  });
});
