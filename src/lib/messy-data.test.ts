import { describe, it, expect } from "vitest";
import { profileDataset, findMergeCandidates, boundedLevenshtein } from "./profile";
import { applyCleanOp, fixMojibake, excelSerialToIso, titleCase } from "./clean";
import { isSequentialIndex, isIdentifierName } from "./number";
import { buildDashboard } from "./auto-dashboard";
import type { Row, CleanOp, Diagnostic } from "./types";

/* Mojibake written as explicit escapes so formatters can't corrupt the test:
 * EN_DASH_MOJI = "â€“" (en dash read as cp1252)
 * EN_DASH_MOJI2 = "Ã¢â‚¬â€œ" (mangled twice) */
const EN_DASH_MOJI = "â€“";
const EN_DASH_MOJI2 = "Ã¢â‚¬â€œ";

/** Presidents-style fixture reproducing the Excel tutorial's problems. */
function makePresidentsRows(): Row[] {
  const parties = [
    "Republican", "Republican", "Republican", "Republican", "Republican",
    "Republican", "Republican", "Republican", "Republican", "Republican",
    "Democratic", "Democratic", "Democratic", "Democratic", "Democratic",
    "Democratic", "Democratic", "Democratic",
    "Republicans", // plural variant
    "Demorcatic",  // typo variant
  ];
  const presidents = [
    "George Washington", "john adams", "Thomas Jefferson", "James Madison",
    "JAMES MONROE", "John Quincy Adams", "Andrew Jackson", "Martin Van Buren",
    "William Harrison", "john tyler", "James Polk", "Zachary Taylor",
    "Millard Fillmore", "Franklin Pierce", "James Buchanan", "Abraham Lincoln",
    "Andrew Johnson", "Ulysses Grant", "Rutherford Hayes", "James Garfield",
  ];
  return parties.map((party, i) => ({
    __EMPTY: i,
    // Serial runs 1..19 then repeats 19: a duplicate without a gap, like the
    // real tutorial file where S.No. 28 appears twice.
    "S.No.": i < 19 ? i + 1 : 19,
    president: presidents[i],
    prior: `Army officer   ( 1775${EN_DASH_MOJI}1783 )`,
    party,
    vice: i === 3 ? "George    Clinton" : "Some Vice",
    salary: 5000 + i * 5000,
    "date updated": 44391,
    "date created": i < 15 ? 40972 : 43862,
  }));
}

const profileOf = (rows: Row[]) =>
  profileDataset({
    id: "p1",
    name: "presidents.csv",
    columns: Object.keys(rows[0]),
    rows,
    createdAt: 0,
    changelog: [],
  });

const diagById = (diags: Diagnostic[], prefix: string) =>
  diags.find((d) => d.id.startsWith(prefix));

describe("index column detection", () => {
  it("flags 0-based and 1-based sequential runs, tolerating a duplicate", () => {
    expect(isSequentialIndex([0, 1, 2, 3, 4, 5])).toBe(true);
    // 1..28, 28 again, 29..45 — an adjacent duplicate from a copy-pasted row
    const withDup = [
      ...Array.from({ length: 28 }, (_, i) => i + 1),
      28,
      ...Array.from({ length: 17 }, (_, i) => i + 29),
    ];
    expect(isSequentialIndex(withDup)).toBe(true);
    expect(isSequentialIndex([5000, 10000, 15000, 20000, 25000])).toBe(false);
    expect(isSequentialIndex([1, 2, 3])).toBe(false); // too short to judge
    // Consecutive integers that don't start at 0/1 are measures, not indexes
    expect(isSequentialIndex(Array.from({ length: 20 }, (_, i) => 50 + i))).toBe(false);
  });

  it("recognises __EMPTY and S.No. as identifier names", () => {
    expect(isIdentifierName("__EMPTY")).toBe(true);
    expect(isIdentifierName("S.No.")).toBe(true);
    expect(isIdentifierName("Sr No")).toBe(true);
    expect(isIdentifierName("salary")).toBe(false);
  });
});

describe("mojibake repair", () => {
  it("fixes single- and double-mangled dashes", () => {
    expect(fixMojibake(`( 1775${EN_DASH_MOJI}1783 )`)).toBe("( 1775–1783 )");
    expect(fixMojibake(`( 1775${EN_DASH_MOJI2}1783 )`)).toBe("( 1775–1783 )");
  });

  it("leaves clean text untouched", () => {
    const clean = "Democratic-Republican (1801) — real dash";
    expect(fixMojibake(clean)).toBe(clean);
  });
});

describe("excel serial dates", () => {
  it("converts serials to ISO dates", () => {
    expect(excelSerialToIso(44391)).toBe("2021-07-14");
    expect(excelSerialToIso(40972)).toBe("2012-03-04");
  });

  it("convertExcelDates op rewrites only plausible serials", () => {
    const rows: Row[] = [{ d: 44391 }, { d: 12 }, { d: "already text" }];
    const out = applyCleanOp(rows, { kind: "convertExcelDates", column: "d" });
    expect(out[0].d).toBe("2021-07-14");
    expect(out[1].d).toBe(12);
    expect(out[2].d).toBe("already text");
  });
});

describe("casing and merging", () => {
  it("titleCase handles initials and hyphens", () => {
    expect(titleCase("JAMES MONROE")).toBe("James Monroe");
    expect(titleCase("john c. calhoun")).toBe("John C. Calhoun");
    expect(titleCase("commander-in-chief")).toBe("Commander-In-Chief");
  });

  it("standardizeCase only rewrites all-lower/ALL-UPPER deviants", () => {
    const rows: Row[] = [
      { p: "Martin Van Buren" },
      { p: "JAMES MONROE" },
      { p: "john tyler" },
    ];
    const out = applyCleanOp(rows, { kind: "standardizeCase", column: "p" });
    expect(out[0].p).toBe("Martin Van Buren"); // mixed case preserved exactly
    expect(out[1].p).toBe("James Monroe");
    expect(out[2].p).toBe("John Tyler");
  });

  it("boundedLevenshtein catches the Demorcatic typo", () => {
    expect(boundedLevenshtein("demorcatic", "democratic", 2)).toBeLessThanOrEqual(2);
    expect(boundedLevenshtein("republican", "democratic", 2)).toBeGreaterThan(2);
  });

  it("findMergeCandidates maps plural and typo variants to the dominant value", () => {
    const counts = new Map<string, number>([
      ["Republican", 10],
      ["Democratic", 8],
      ["Republicans", 1],
      ["Demorcatic", 1],
      ["Whig", 3],
    ]);
    const mapping = findMergeCandidates(counts);
    expect(mapping["Republicans"]).toBe("Republican");
    expect(mapping["Demorcatic"]).toBe("Democratic");
    expect(mapping["Whig"]).toBeUndefined();
    expect(mapping["Democratic"]).toBeUndefined(); // never merge the majors into each other
  });
});

describe("profiling the presidents fixture", () => {
  const ds = profileOf(makePresidentsRows());

  it("flags __EMPTY and S.No. as droppable index columns", () => {
    const empty = diagById(ds.diagnostics, "diag_index___EMPTY");
    const sno = diagById(ds.diagnostics, "diag_index_S.No.");
    expect(empty?.fix?.op).toEqual({ kind: "dropColumn", column: "__EMPTY" });
    expect(sno?.fix?.op).toEqual({ kind: "dropColumn", column: "S.No." });
  });

  it("types serial-date columns as dates with a convert fix and real range", () => {
    const created = ds.profiles.find((p) => p.name === "date created")!;
    expect(created.type).toBe("date");
    expect(created.dateMin).toBe("2012-03-04");
    expect(created.dateMax).toBe("2020-02-01");
    expect(diagById(ds.diagnostics, "diag_exceldate_date created")?.fix?.op).toEqual({
      kind: "convertExcelDates",
      column: "date created",
    });
  });

  it("raises encoding, casing, merge, and repeated-ID diagnostics", () => {
    expect(diagById(ds.diagnostics, "diag_encoding")?.fix?.op).toEqual({ kind: "fixEncoding" });
    expect(diagById(ds.diagnostics, "diag_case_president")?.fix?.op).toEqual({
      kind: "standardizeCase",
      column: "president",
    });
    const merge = diagById(ds.diagnostics, "diag_merge_party");
    expect(merge?.fix?.op.kind).toBe("mergeValues");
    expect(diagById(ds.diagnostics, "diag_dupid_S.No.")).toBeDefined();
  });

  it("no longer reports a perfect health score on dirty data", () => {
    expect(ds.health.overall).toBeLessThan(95);
    expect(ds.health.consistency).toBeLessThanOrEqual(60);
  });
});

describe("auto-dashboard on the presidents fixture", () => {
  const ds = profileOf(makePresidentsRows());
  const spec = buildDashboard(ds);

  it("never uses index columns as measures", () => {
    const labels = spec.kpis.map((k) => k.label);
    expect(labels).not.toContain("Total __EMPTY");
    expect(labels).not.toContain("Total S.No.");
    expect(labels).toContain("Total salary");
    expect(spec.charts.some((c) => c.title.includes("__EMPTY"))).toBe(false);
    expect(spec.insights.some((i) => i.includes("__EMPTY") || i.includes("S.No."))).toBe(false);
  });

  it("pivots salary by party and builds a time series from the varying serial-date column", () => {
    expect(spec.charts.some((c) => c.kind === "bar" && c.title === "salary by party")).toBe(true);
    const line = spec.charts.find((c) => c.kind === "line");
    expect(line).toBeDefined();
    expect(line!.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the full cleaning cascade", () => {
  it("near-duplicate rows become exact duplicates after encoding/space/merge/case fixes", () => {
    const base: Row = {
      president: "Woodrow Wilson",
      prior: `Governor   ( 1911${EN_DASH_MOJI}1913 )`,
      party: "Democratic",
      salary: 225000,
    };
    const nearDup: Row = {
      president: "woodrow wilson",
      prior: "Governor ( 1911–1913 )",
      party: "Demorcatic",
      salary: 225000,
    };
    // Enough context rows for the detectors to establish the dominant patterns.
    const context: Row[] = Array.from({ length: 10 }, (_, i) => ({
      president: `President Number${i}`,
      prior: "Some Prior Role",
      party: i % 2 === 0 ? "Democratic" : "Republican",
      salary: 1000 * i,
    }));

    let rows = [...context, base, nearDup];
    const ops: CleanOp[] = [
      { kind: "fixEncoding" },
      { kind: "trimWhitespace" },
      { kind: "mergeValues", column: "party", mapping: { Demorcatic: "Democratic" } },
      { kind: "standardizeCase", column: "president" },
    ];
    for (const op of ops) rows = applyCleanOp(rows, op);

    const reprofiled = profileOf(rows);
    expect(reprofiled.duplicateRows).toBe(1);

    const deduped = applyCleanOp(rows, { kind: "dropDuplicates" });
    expect(deduped).toHaveLength(11);
  });
});
