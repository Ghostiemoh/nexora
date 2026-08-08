import { describe, it, expect } from "vitest";
import {
  SYNCED_KINDS,
  NEVER_SYNCED,
  buildRecipeBook,
  mergeRecipeBooks,
  buildSyncRecords,
  isSyncedKind,
  parseRecipeBookEntry,
} from "./sync-payload";
import { findRecurringRecipe, fingerprintKey, fingerprintDataset } from "./fingerprint";
import { profileDataset } from "./profile";
import type { CleanOp, Dataset, Row, TeamMember } from "./types";

function makeDataset(
  name: string,
  rows: Row[],
  recipe?: CleanOp[],
  updatedAt = 1_000
): Dataset {
  const ds = profileDataset({
    id: name,
    name,
    columns: Object.keys(rows[0] ?? {}),
    rows,
    createdAt: 1,
    changelog: [],
  });
  if (recipe) ds.recipe = recipe;
  ds.updatedAt = updatedAt;
  return ds;
}

const sales: Row[] = [
  { "Order Date": "2026-09-01", Region: "EMEA", Revenue: 1200, Customer: "acme" },
  { "Order Date": "2026-09-02", Region: "APAC", Revenue: 900, Customer: "globex" },
  { "Order Date": "2026-09-03", Region: "EMEA", Revenue: 1500, Customer: "initech" },
];

const headcount: Row[] = [
  { employee_id: 1, department: "Legal", salary: 90000 },
  { employee_id: 2, department: "Ops", salary: 70000 },
];

const ops: CleanOp[] = [{ kind: "trimWhitespace" }, { kind: "dropDuplicates" }];

const roster: TeamMember[] = [
  {
    id: "m1",
    name: "A Analyst",
    role: "Analyst",
    email: "a@example.com",
    roleType: "editor",
    initials: "AA",
    bgClass: "bg-primary",
  },
];

describe("the allowlist", () => {
  it("transmits only recipes and the roster", () => {
    expect([...SYNCED_KINDS]).toEqual(["recipe", "roster"]);
  });

  /* The regression guard that matters. If someone later adds datasets or a
   * connection string to the sync path, this fails rather than quietly shipping
   * a client's rows to a server. */
  it("never emits a record for anything on the excluded list", () => {
    const dataset = makeDataset("Sales September", sales, ops);
    const records = buildSyncRecords({
      datasets: [dataset],
      teamMembers: roster,
      rosterUpdatedAt: 2_000,
    });

    const serialized = JSON.stringify(records);
    for (const kind of Object.keys(NEVER_SYNCED)) {
      expect(records.some((r) => (r.kind as string) === kind)).toBe(false);
    }
    // No cell value from the dataset appears anywhere in the outbound payload.
    expect(serialized).not.toContain("acme");
    expect(serialized).not.toContain("globex");
    expect(serialized).not.toContain("1200");
  });

  it("documents a reason for every exclusion", () => {
    for (const [key, reason] of Object.entries(NEVER_SYNCED)) {
      expect(reason.length, `${key} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("rejects a record kind it does not recognize", () => {
    expect(isSyncedKind("recipe")).toBe(true);
    expect(isSyncedKind("dataset")).toBe(false);
    expect(isSyncedKind(null)).toBe(false);
  });
});

describe("buildRecipeBook", () => {
  it("carries one entry per schema, with the recipe and a display name", () => {
    const book = buildRecipeBook([makeDataset("Sales September", sales, ops)]);
    expect(book).toHaveLength(1);
    expect(book[0].ops).toEqual(ops);
    expect(book[0].sourceName).toBe("Sales September");
    expect(book[0].schema).toBe(fingerprintKey(fingerprintDataset(makeDataset("x", sales))));
  });

  it("ignores datasets with nothing recorded on them", () => {
    expect(buildRecipeBook([makeDataset("Sales September", sales)])).toEqual([]);
  });

  it("keeps one schema apart from another", () => {
    const book = buildRecipeBook([
      makeDataset("Sales", sales, ops),
      makeDataset("Headcount", headcount, ops),
    ]);
    expect(book).toHaveLength(2);
  });

  it("keeps the most recent when two datasets share a schema", () => {
    const book = buildRecipeBook([
      makeDataset("Sales September", sales, [{ kind: "trimWhitespace" }], 1_000),
      makeDataset("Sales October", sales, [{ kind: "dropDuplicates" }], 5_000),
    ]);
    expect(book).toHaveLength(1);
    expect(book[0].sourceName).toBe("Sales October");
    expect(book[0].ops).toEqual([{ kind: "dropDuplicates" }]);
  });

  it("is ordered deterministically, so two devices seal identical bytes", () => {
    const a = buildRecipeBook([
      makeDataset("Sales", sales, ops),
      makeDataset("Headcount", headcount, ops),
    ]);
    const b = buildRecipeBook([
      makeDataset("Headcount", headcount, ops),
      makeDataset("Sales", sales, ops),
    ]);
    expect(a.map((e) => e.schema)).toEqual(b.map((e) => e.schema));
  });

  it("skips a dataset with no columns rather than emitting an empty schema", () => {
    expect(buildRecipeBook([makeDataset("Empty", [], ops)])).toEqual([]);
  });
});

describe("mergeRecipeBooks", () => {
  it("takes the union when the two sides hold different schemas", () => {
    const local = buildRecipeBook([makeDataset("Sales", sales, ops)]);
    const incoming = buildRecipeBook([makeDataset("Headcount", headcount, ops)]);
    expect(mergeRecipeBooks(local, incoming)).toHaveLength(2);
  });

  it("prefers the newer entry for a schema both sides hold", () => {
    const local = buildRecipeBook([
      makeDataset("Sales laptop", sales, [{ kind: "trimWhitespace" }], 1_000),
    ]);
    const incoming = buildRecipeBook([
      makeDataset("Sales desktop", sales, [{ kind: "dropDuplicates" }], 9_000),
    ]);
    const merged = mergeRecipeBooks(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].sourceName).toBe("Sales desktop");
  });

  it("keeps the local entry when the incoming one is older", () => {
    const local = buildRecipeBook([makeDataset("Sales laptop", sales, ops, 9_000)]);
    const incoming = buildRecipeBook([makeDataset("Sales desktop", sales, ops, 1_000)]);
    expect(mergeRecipeBooks(local, incoming)[0].sourceName).toBe("Sales laptop");
  });

  it("is idempotent", () => {
    const book = buildRecipeBook([makeDataset("Sales", sales, ops)]);
    expect(mergeRecipeBooks(book, book)).toEqual(book);
  });
});

describe("the close on a second device", () => {
  /* The point of syncing recipes: a file lands on a machine that has never seen
   * the dataset the recipe was recorded from, and the close still recognizes it. */
  it("matches an imported file against a recipe carried from another device", () => {
    const book = buildRecipeBook([makeDataset("Sales September", sales, ops)]);
    const freshImport = makeDataset("Sales October", sales);

    const found = findRecurringRecipe(freshImport, book);
    expect(found).not.toBeNull();
    expect(found!.entry.sourceName).toBe("Sales September");
    expect(found!.match.score).toBe(100);
    expect(found!.entry.ops).toEqual(ops);
  });

  it("still matches when the incoming file carries the index column the recipe drops", () => {
    const book = buildRecipeBook([
      makeDataset("Sales September", sales, [
        { kind: "dropColumn", column: "__index" },
        { kind: "trimWhitespace" },
      ]),
    ]);
    const raw = makeDataset(
      "Sales October",
      sales.map((r, i) => ({ __index: i, ...r }))
    );
    expect(findRecurringRecipe(raw, book)).not.toBeNull();
  });

  it("refuses an unrelated file", () => {
    const book = buildRecipeBook([makeDataset("Sales September", sales, ops)]);
    expect(findRecurringRecipe(makeDataset("Headcount", headcount), book)).toBeNull();
  });

  it("prefers the higher-scoring entry when the book holds several", () => {
    const book = mergeRecipeBooks(
      buildRecipeBook([makeDataset("Sales", sales, ops)]),
      buildRecipeBook([makeDataset("Headcount", headcount, ops)])
    );
    expect(findRecurringRecipe(makeDataset("Sales October", sales), book)!.entry.sourceName).toBe(
      "Sales"
    );
  });

  it("ignores an entry with an empty op list", () => {
    const book = buildRecipeBook([makeDataset("Sales", sales, ops)]).map((e) => ({
      ...e,
      ops: [],
    }));
    expect(findRecurringRecipe(makeDataset("Sales October", sales), book)).toBeNull();
  });
});

describe("buildSyncRecords", () => {
  it("gives every record a device-independent logical id", () => {
    const records = buildSyncRecords({
      datasets: [makeDataset("Sales September", sales, ops)],
      teamMembers: roster,
      rosterUpdatedAt: 2_000,
    });
    expect(records.map((r) => r.kind).sort()).toEqual(["recipe", "roster"]);
    // The id must not carry a local dataset id.
    expect(records.find((r) => r.kind === "recipe")!.logicalId).not.toContain(
      "Sales September"
    );
  });

  it("omits the roster entirely when there is nobody in it", () => {
    const records = buildSyncRecords({
      datasets: [makeDataset("Sales", sales, ops)],
      teamMembers: [],
      rosterUpdatedAt: 0,
    });
    expect(records.some((r) => r.kind === "roster")).toBe(false);
  });

  it("emits nothing for an untouched workspace", () => {
    expect(
      buildSyncRecords({ datasets: [], teamMembers: [], rosterUpdatedAt: 0 })
    ).toEqual([]);
  });

  it("produces identical records from identical state, so sync does not thrash", () => {
    const source = {
      datasets: [makeDataset("Sales", sales, ops)],
      teamMembers: roster,
      rosterUpdatedAt: 2_000,
    };
    expect(buildSyncRecords(source)).toEqual(buildSyncRecords(source));
  });
});

describe("parseRecipeBookEntry", () => {
  it("accepts what buildRecipeBook produced", () => {
    const [entry] = buildRecipeBook([makeDataset("Sales", sales, ops)]);
    expect(parseRecipeBookEntry(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
  });

  it("rejects a payload that is not a recipe record", () => {
    expect(() => parseRecipeBookEntry({ nope: true })).toThrow("Not a Nexora recipe record");
    expect(() => parseRecipeBookEntry(null)).toThrow();
    expect(() => parseRecipeBookEntry({ schema: "x", ops: "not an array" })).toThrow();
  });
});
