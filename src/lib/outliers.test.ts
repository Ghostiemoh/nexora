/* An outlier is a question, not a defect.
 *
 * The same extreme value can be the best customer on the books, a fraudulent
 * transaction, a sentinel like 9999 that a system writes when it has nothing,
 * a slipped decimal point, or the month a real event happened. A tool that
 * offers "cap it or ignore it" has quietly decided it is the fourth one.
 *
 * So this engine never returns a verdict. It returns the readings that fit,
 * each with the evidence for it and the check that would confirm it, ordered
 * by how well the data supports them. */

import { describe, it, expect } from "vitest";
import { analyzeOutliers } from "./outliers";
import { profileDataset } from "./profile";
import type { Dataset, Row } from "./types";

function makeDataset(rows: Row[]): Dataset {
  return profileDataset({
    id: "t",
    name: "t.csv",
    columns: Object.keys(rows[0] ?? {}),
    rows,
    createdAt: 1,
    changelog: [],
  });
}

/** A tight body of values with a handful of genuine extremes. */
function withExtremes(): Row[] {
  const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    tier: i % 2 === 0 ? "standard" : "basic",
    amount: 100 + (i % 40),
  }));
  for (let i = 0; i < 6; i++) {
    rows.push({ id: 300 + i, tier: "enterprise", amount: 5000 + i * 250 });
  }
  return rows;
}

describe("analyzeOutliers", () => {
  it("finds nothing in a column with no extremes", () => {
    const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      amount: 100 + (i % 10),
    }));
    const report = analyzeOutliers(makeDataset(rows), "amount");
    expect(report.count).toBe(0);
    expect(report.readings).toEqual([]);
  });

  it("returns an empty report for a column that is not numeric", () => {
    const rows: Row[] = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
    expect(analyzeOutliers(makeDataset(rows), "name").count).toBe(0);
  });

  describe("detection", () => {
    const report = analyzeOutliers(makeDataset(withExtremes()), "amount");

    it("counts the extremes and states the fences it used", () => {
      expect(report.count).toBeGreaterThan(0);
      expect(report.upperFence).toBeGreaterThan(report.lowerFence);
      expect(report.method).toBe("iqr");
    });

    it("returns the actual records so they can be inspected", () => {
      expect(report.records.length).toBeGreaterThan(0);
      for (const r of report.records) {
        expect(typeof r.value).toBe("number");
        expect(r.rowIndex).toBeGreaterThanOrEqual(0);
      }
    });

    it("ranks the most extreme record first", () => {
      const devs = report.records.map((r) => r.deviation);
      expect([...devs].sort((a, b) => b - a)).toEqual(devs);
    });

    it("separates high from low", () => {
      expect(report.high).toBe(report.count);
      expect(report.low).toBe(0);
    });

    it("says how much of the column total the extremes account for", () => {
      // 6 rows near 5000+ against 200 rows near 120 is a large share, and that
      // concentration is the business fact worth surfacing.
      expect(report.valueShare).toBeGreaterThan(20);
    });
  });

  describe("segmentation", () => {
    it("finds the segment the outliers concentrate in", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      const top = report.segments[0];
      expect(top.column).toBe("tier");
      expect(top.segment).toBe("enterprise");
      expect(top.outlierRate).toBeGreaterThan(top.baseRate);
    });

    it("stays quiet when the outliers are spread evenly", () => {
      const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        tier: i % 2 === 0 ? "a" : "b",
        amount: i % 25 === 0 ? 9000 : 100 + (i % 30),
      }));
      const report = analyzeOutliers(makeDataset(rows), "amount");
      expect(report.segments).toEqual([]);
    });
  });

  describe("readings", () => {
    it("never concludes the values are wrong", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      const all = report.readings.map((r) => `${r.label} ${r.rationale}`).join(" ");
      expect(all).not.toMatch(/\bthese are (?:errors|wrong|invalid)\b/i);
      expect(report.readings.length).toBeGreaterThan(1);
    });

    it("gives every reading a check that would confirm it", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      for (const reading of report.readings) {
        expect(reading.check.length).toBeGreaterThan(10);
      }
    });

    it("leads with the segment reading when the extremes sit in one group", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      expect(report.readings[0].id).toBe("segment");
    });

    /* A repeated identical extreme is the fingerprint of a system default,
     * not of six unrelated customers each spending exactly 9999. */
    it("flags a repeated identical extreme as a possible sentinel value", () => {
      const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        amount: i % 20 === 0 ? 9999 : 100 + (i % 30),
      }));
      const report = analyzeOutliers(makeDataset(rows), "amount");
      expect(report.readings.some((r) => r.id === "sentinel")).toBe(true);
    });

    it("does not cry sentinel when the extremes are all different", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      expect(report.readings.some((r) => r.id === "sentinel")).toBe(false);
    });

    /* A negative amount in a column that is otherwise all positive is the one
     * case where "look at this as an error" is genuinely the lead reading. */
    it("flags impossible-looking negatives", () => {
      const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        amount: i === 5 ? -4000 : 100 + (i % 30),
      }));
      const report = analyzeOutliers(makeDataset(rows), "amount");
      expect(report.readings.some((r) => r.id === "sign")).toBe(true);
    });

    it("offers a decimal-slip reading when an extreme is a round multiple", () => {
      const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        amount: i === 7 ? 12000 : 120 + (i % 5),
      }));
      const report = analyzeOutliers(makeDataset(rows), "amount");
      expect(report.readings.some((r) => r.id === "scale")).toBe(true);
    });
  });

  describe("contrast", () => {
    it("compares outlier rows against normal rows on other numeric columns", () => {
      const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        units: i < 190 ? 2 : 90,
        amount: i < 190 ? 100 + (i % 20) : 9000,
      }));
      const report = analyzeOutliers(makeDataset(rows), "amount");
      const units = report.contrasts.find((c) => c.column === "units");
      expect(units).toBeDefined();
      expect(units!.outlierMean).toBeGreaterThan(units!.normalMean);
    });

    it("does not contrast a column against itself", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      expect(report.contrasts.some((c) => c.column === "amount")).toBe(false);
    });
  });

  describe("investigation prompts", () => {
    it("grounds its questions in the real column", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      expect(report.questions.length).toBeGreaterThan(0);
      expect(report.questions.join(" ")).toContain("amount");
    });

    it("asks about the segment when there is one", () => {
      const report = analyzeOutliers(makeDataset(withExtremes()), "amount");
      expect(report.questions.join(" ")).toMatch(/enterprise|tier/);
    });
  });
});
