import { describe, it, expect } from "vitest";
import { applyCleanOp } from "./clean";
import { replayRecipe, previewCleanOp } from "./recipe";
import type { Row } from "./types";

describe("findReplace (Ctrl+H)", () => {
  const rows: Row[] = [
    { name: "Lagos State", region: "lagos", amount: 100 },
    { name: "Kano State", region: "Lagos Island", amount: 200 },
  ];

  it("replaces case-insensitively by default, across all text columns", () => {
    const out = applyCleanOp(rows, { kind: "findReplace", column: null, find: "lagos", replace: "LG" });
    expect(out[0].name).toBe("LG State");
    expect(out[0].region).toBe("LG");
    expect(out[1].region).toBe("LG Island");
    expect(out[0].amount).toBe(100); // numbers untouched
  });

  it("respects matchCase and a single-column scope", () => {
    const out = applyCleanOp(rows, {
      kind: "findReplace", column: "region", find: "lagos", replace: "LG", matchCase: true,
    });
    expect(out[0].region).toBe("LG");        // lowercase match
    expect(out[1].region).toBe("Lagos Island"); // case mismatch left alone
    expect(out[0].name).toBe("Lagos State");    // other column untouched
  });

  it("treats the find string literally, not as regex", () => {
    const dotted: Row[] = [{ v: "a.b", w: "axb" }];
    const out = applyCleanOp(dotted, { kind: "findReplace", column: null, find: "a.b", replace: "Z" });
    expect(out[0].v).toBe("Z");
    expect(out[0].w).toBe("axb");
  });

  it("previewCleanOp counts affected cells", () => {
    expect(previewCleanOp(rows, { kind: "findReplace", column: null, find: "lagos", replace: "LG" }))
      .toEqual({ changedCells: 3, removedRows: 0 });
  });
});

describe("splitColumn (Text to Columns)", () => {
  const rows: Row[] = [
    { id: 1, place: "Lagos, Nigeria", note: "x" },
    { id: 2, place: "Accra, Ghana, West Africa", note: "y" },
    { id: 3, place: "London", note: "z" },
  ];

  it("splits on the delimiter, pads short rows with null, keeps key order", () => {
    const out = applyCleanOp(rows, { kind: "splitColumn", column: "place", delimiter: "," });
    expect(Object.keys(out[0])).toEqual(["id", "place_1", "place_2", "place_3", "note"]);
    expect(out[0].place_1).toBe("Lagos");
    expect(out[0].place_2).toBe("Nigeria");
    expect(out[0].place_3).toBeNull();
    expect(out[1].place_3).toBe("West Africa");
    expect(out[2].place_1).toBe("London");
    expect(out[2].place_2).toBeNull();
  });

  it("keepOriginal preserves the source column before the parts", () => {
    const out = applyCleanOp(rows, { kind: "splitColumn", column: "place", delimiter: ",", keepOriginal: true });
    expect(Object.keys(out[0])).toEqual(["id", "place", "place_1", "place_2", "place_3", "note"]);
    expect(out[0].place).toBe("Lagos, Nigeria");
  });

  it("is a no-op when no cell contains the delimiter", () => {
    const out = applyCleanOp(rows, { kind: "splitColumn", column: "place", delimiter: "|" });
    expect(out).toEqual(rows);
  });

  it("avoids name collisions with existing columns", () => {
    const clash: Row[] = [{ v: "a-b", v_1: "keep" }, { v: "c-d", v_1: "keep2" }];
    const out = applyCleanOp(clash, { kind: "splitColumn", column: "v", delimiter: "-" });
    expect(out[0].v_1).toBe("keep");
    expect(out[0].v_1x).toBe("a");
    expect(out[0].v_2).toBe("b");
  });

  it("replayRecipe recomputes the schema after a split", () => {
    const result = replayRecipe(rows, ["id", "place", "note"], [
      { kind: "splitColumn", column: "place", delimiter: "," },
      { kind: "findReplace", column: "place_1", find: "Lagos", replace: "LOS" },
    ]);
    expect(result.applied).toBe(2);
    expect(result.columns).toEqual(["id", "place_1", "place_2", "place_3", "note"]);
    expect(result.rows[0].place_1).toBe("LOS");
  });
});
