/* Missing values are the start of an investigation, not a cell to fill.
 *
 * The rules this engine has to respect, because getting them wrong is how a
 * tool talks an analyst into a false conclusion:
 *
 *  1. MCAR can never be proven, only failed to be disproven. The right phrase
 *     is "consistent with", never "is".
 *  2. MAR is testable. If whether a value is missing depends on something you
 *     can observe, a contingency table will show it.
 *  3. MNAR is by definition untestable from the observed data, because it says
 *     missingness depends on the value that is not there. It may only ever be
 *     raised as a hypothesis with a reason to check it, never as a verdict.
 *  4. Every sentence is tagged with the kind of claim it is, so "37% of rows in
 *     EMEA are missing" and "the export probably broke" cannot be read at the
 *     same level of confidence. */

import { describe, it, expect } from "vitest";
import { analyzeMissingness, chiSquarePValue, cramersV } from "./missingness";
import { profileDataset } from "./profile";
import type { Dataset, Row } from "./types";

function makeDataset(rows: Row[], name = "test.csv"): Dataset {
  return profileDataset({
    id: name,
    name,
    columns: Object.keys(rows[0] ?? {}),
    rows,
    createdAt: 1,
    changelog: [],
  });
}

/** Missing at a flat 25% regardless of region: nothing to find. */
function mcarRows(n = 400): Row[] {
  const regions = ["EMEA", "APAC", "AMER", "LATAM"];
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    region: regions[i % regions.length],
    // every 4th row, cycling independently of region length 4 would correlate,
    // so use a stride coprime with the region count
    revenue: i % 7 === 0 ? null : 100 + (i % 50),
  }));
}

/** Missing almost entirely inside one region: a textbook MAR signal. */
function marRows(n = 400): Row[] {
  const regions = ["EMEA", "APAC", "AMER", "LATAM"];
  return Array.from({ length: n }, (_, i) => {
    const region = regions[i % regions.length];
    return {
      id: i + 1,
      region,
      revenue: region === "LATAM" && i % 10 !== 0 ? null : 100 + (i % 50),
    };
  });
}

describe("chi-square helpers", () => {
  it("gives a large p-value when observed matches expected", () => {
    expect(chiSquarePValue(0, 3)).toBeCloseTo(1, 5);
  });

  it("shrinks the p-value as the statistic grows", () => {
    const a = chiSquarePValue(2, 3);
    const b = chiSquarePValue(12, 3);
    expect(b).toBeLessThan(a);
    expect(b).toBeLessThan(0.01);
  });

  it("matches a known critical value: chi2 = 3.841, df = 1 is p = 0.05", () => {
    expect(chiSquarePValue(3.841, 1)).toBeCloseTo(0.05, 3);
  });

  it("matches a known critical value: chi2 = 11.345, df = 3 is p = 0.01", () => {
    expect(chiSquarePValue(11.345, 3)).toBeCloseTo(0.01, 3);
  });

  it("reports no association when the split is even", () => {
    // 50/50 in both segments: V is 0
    expect(cramersV(0, 200)).toBe(0);
  });

  it("caps Cramér's V at 1", () => {
    expect(cramersV(1000, 100)).toBeLessThanOrEqual(1);
  });
});

describe("analyzeMissingness", () => {
  it("returns nothing to investigate when the column is complete", () => {
    const ds = makeDataset([
      { id: 1, region: "EMEA", revenue: 10 },
      { id: 2, region: "APAC", revenue: 20 },
    ]);
    const report = analyzeMissingness(ds, "revenue");
    expect(report.missingCount).toBe(0);
    expect(report.verdict).toBe("none");
    expect(report.associations).toEqual([]);
  });

  it("counts what is missing before saying anything about why", () => {
    const ds = makeDataset(mcarRows());
    const report = analyzeMissingness(ds, "revenue");
    expect(report.missingCount).toBeGreaterThan(0);
    expect(report.missingPct).toBeGreaterThan(0);
    // The count is a fact about the file, so it is observed, not inferred.
    expect(report.evidence[0].strength).toBe("observed");
  });

  describe("when missingness is unrelated to everything observable", () => {
    const report = analyzeMissingness(makeDataset(mcarRows()), "revenue");

    it("finds no meaningful association", () => {
      expect(report.associations).toEqual([]);
    });

    it("reaches for MCAR", () => {
      expect(report.verdict).toBe("MCAR");
    });

    /* The whole point. Absence of evidence is not proof. */
    it("never claims MCAR is established", () => {
      const said = report.evidence.map((e) => e.text).join(" ");
      expect(said).toMatch(/consistent with/i);
      expect(said).not.toMatch(/\bis MCAR\b/);
      expect(said).not.toMatch(/\bproves?\b/i);
      expect(said).not.toMatch(/\bconfirms?\b/i);
    });

    it("grades its own conclusion no higher than statistically supported", () => {
      expect(report.confidence).not.toBe("observed");
    });
  });

  describe("when missingness tracks a column you can see", () => {
    const report = analyzeMissingness(makeDataset(marRows()), "revenue");

    it("reaches for MAR", () => {
      expect(report.verdict).toBe("MAR");
    });

    it("names the column and the segment responsible", () => {
      const top = report.associations[0];
      expect(top.column).toBe("region");
      expect(top.segment).toBe("LATAM");
    });

    it("shows both shares, so the reader can judge the gap themselves", () => {
      const top = report.associations[0];
      expect(top.missingShare).toBeGreaterThan(top.presentShare);
      expect(top.missingShare).toBeLessThanOrEqual(100);
      expect(top.presentShare).toBeGreaterThanOrEqual(0);
    });

    it("backs the association with a test statistic rather than a vibe", () => {
      const top = report.associations[0];
      expect(top.pValue).toBeLessThan(0.05);
      expect(top.cramersV).toBeGreaterThan(0.2);
    });

    it("ranks the strongest association first", () => {
      const vs = report.associations.map((a) => a.cramersV);
      expect([...vs].sort((a, b) => b - a)).toEqual(vs);
    });
  });

  describe("MNAR", () => {
    it("is never returned as a verdict, because it cannot be tested", () => {
      for (const rows of [mcarRows(), marRows()]) {
        const report = analyzeMissingness(makeDataset(rows), "revenue");
        expect(report.verdict).not.toBe("MNAR");
      }
    });

    it("is raised as a hypothesis the analyst has to rule out", () => {
      const report = analyzeMissingness(makeDataset(mcarRows()), "revenue");
      const mnar = report.evidence.find((e) => /MNAR/.test(e.text));
      expect(mnar).toBeDefined();
      expect(mnar!.strength).toBe("hypothesis");
    });
  });

  describe("timing", () => {
    it("finds the point where missingness starts", () => {
      const rows: Row[] = Array.from({ length: 200 }, (_, i) => {
        const day = String((i % 28) + 1).padStart(2, "0");
        const month = i < 100 ? "01" : "06";
        return {
          id: i + 1,
          captured_at: `2026-${month}-${day}`,
          revenue: i < 100 ? 100 + i : null,
        };
      });
      const report = analyzeMissingness(makeDataset(rows), "revenue");
      expect(report.timing).not.toBeNull();
      expect(report.timing!.column).toBe("captured_at");
      expect(report.timing!.afterRate).toBeGreaterThan(report.timing!.beforeRate);
      // A clean break in time is a process story, and worth saying so.
      expect(report.evidence.some((e) => /process|pipeline|collection/i.test(e.text))).toBe(true);
    });

    it("stays null when gaps are spread evenly across the range", () => {
      const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
        id: i + 1,
        captured_at: `2026-0${(i % 9) + 1}-15`,
        revenue: i % 5 === 0 ? null : 100 + i,
      }));
      expect(analyzeMissingness(makeDataset(rows), "revenue").timing).toBeNull();
    });
  });

  describe("investigation prompts", () => {
    it("offers questions the AI analyst can actually answer", () => {
      const report = analyzeMissingness(makeDataset(marRows()), "revenue");
      expect(report.questions.length).toBeGreaterThan(0);
      // The prompts have to mention the real column, not a placeholder.
      expect(report.questions.join(" ")).toContain("revenue");
    });

    it("asks about the associated segment once one is found", () => {
      const report = analyzeMissingness(makeDataset(marRows()), "revenue");
      expect(report.questions.join(" ")).toMatch(/LATAM|region/);
    });
  });

  describe("robustness", () => {
    it("ignores segments too small to say anything about", () => {
      const rows: Row[] = [
        ...Array.from({ length: 200 }, (_, i) => ({
          id: i,
          region: "EMEA",
          revenue: i % 3 === 0 ? null : 10,
        })),
        { id: 999, region: "ANTARCTICA", revenue: null },
      ];
      const report = analyzeMissingness(makeDataset(rows), "revenue");
      expect(report.associations.some((a) => a.segment === "ANTARCTICA")).toBe(false);
    });

    it("skips high-cardinality columns that would fit any pattern", () => {
      const rows: Row[] = Array.from({ length: 300 }, (_, i) => ({
        id: i,
        order_ref: `REF-${i}`,
        revenue: i % 4 === 0 ? null : 10,
      }));
      const report = analyzeMissingness(makeDataset(rows), "revenue");
      expect(report.associations.some((a) => a.column === "order_ref")).toBe(false);
    });

    it("survives a column that is entirely missing", () => {
      const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        region: "EMEA",
        revenue: null,
      }));
      const report = analyzeMissingness(makeDataset(rows), "revenue");
      expect(report.missingPct).toBe(100);
      expect(() => report.evidence.map((e) => e.text)).not.toThrow();
    });

    it("returns an empty report for a column that does not exist", () => {
      const report = analyzeMissingness(makeDataset(mcarRows()), "nope");
      expect(report.verdict).toBe("none");
    });
  });
});
