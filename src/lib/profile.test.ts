import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import type { Row } from "./types";

function ds(columns: string[], rows: Row[]) {
  return profileDataset({ id: "t", name: "t.csv", columns, rows, createdAt: 0, changelog: [] });
}

describe("numeric profiling", () => {
  const values = [2, 4, 4, 4, 5, 5, 7, 9];
  const d = ds(["x"], values.map((x) => ({ x })));
  const p = d.profiles[0];

  it("infers number type", () => {
    expect(p.type).toBe("number");
  });

  it("uses sample standard deviation (n-1), not population", () => {
    // population std = 2.0; sample std = sqrt(32/7) = 2.138...
    expect(p.std).toBe(2.14);
  });

  it("computes quantiles by linear interpolation", () => {
    expect(p.median).toBe(4.5);
    expect(p.p25).toBe(4);
    expect(p.p75).toBe(5.5);
    expect(p.iqr).toBe(1.5);
  });

  it("counts IQR outliers", () => {
    // fences: [1.75, 7.75] -> only 9 is an outlier
    expect(p.outlierCount).toBe(1);
  });

  it("reflects outliers in the accuracy health dimension", () => {
    // 1 of 8 numeric values is an outlier -> 87.5% -> 88 rounded
    expect(d.health.accuracy).toBe(88);
  });
});

describe("every finding offers a way out", () => {
  it("hands the outlier finding a fix the user can actually click", () => {
    const d = ds(["x"], [2, 4, 4, 4, 5, 5, 7, 9].map((x) => ({ x })));
    const outlier = d.diagnostics.find((diag) => diag.id === "diag_outliers_x");
    expect(outlier?.fix).toBeDefined();
    expect(outlier!.fix!.op).toEqual({ kind: "capOutliers", column: "x" });
    // Winsorizing is a judgement call, so it stays out of the bulk run.
    expect(outlier!.fix!.manual).toBe(true);
  });

  it("gives findings with no automatic remedy written guidance instead", () => {
    // A near-duplicate: same id, one cell differs, so dropDuplicates cannot help.
    const d = ds(
      ["order_id", "city"],
      [
        { order_id: "A-1", city: "Kano" },
        { order_id: "A-1", city: "kano " },
        { order_id: "A-2", city: "Lagos" },
        { order_id: "A-3", city: "Abuja" },
        { order_id: "A-4", city: "Jos" },
      ]
    );
    const dupId = d.diagnostics.find((diag) => diag.id.startsWith("diag_dupid_"));
    expect(dupId).toBeDefined();
    expect(dupId!.fix).toBeUndefined();
    expect(dupId!.guidance).toBeTruthy();
  });

  it("never leaves a finding with neither a fix nor guidance", () => {
    const d = ds(
      ["order_id", "city", "amount"],
      [
        { order_id: "A-1", city: "Kano", amount: 10 },
        { order_id: "A-1", city: "kano ", amount: 12 },
        { order_id: "A-2", city: "LAGOS", amount: 11 },
        { order_id: "A-3", city: null, amount: 9 },
        { order_id: "A-4", city: "Jos", amount: 5000 },
      ]
    );
    expect(d.diagnostics.length).toBeGreaterThan(0);
    for (const diag of d.diagnostics) {
      expect(Boolean(diag.fix || diag.guidance), `"${diag.title}" is a dead end`).toBe(true);
    }
  });
});

describe("type-inference guards", () => {
  it("keeps leading-zero / id-named columns as strings, not numbers", () => {
    const d = ds(["zip"], ["00123", "00456", "00789", "01010"].map((zip) => ({ zip })));
    expect(d.profiles[0].type).not.toBe("number");
  });

  it("detects strict dates and reports a date range", () => {
    const d = ds(["signup"], ["2021-01-05", "2021-06-30", "2020-12-01"].map((signup) => ({ signup })));
    expect(d.profiles[0].type).toBe("date");
    expect(d.profiles[0].dateMin).toBe("2020-12-01");
    expect(d.profiles[0].dateMax).toBe("2021-06-30");
  });

  it("does not treat month words as dates", () => {
    const d = ds(["m"], ["May", "March", "June", "April"].map((m) => ({ m })));
    expect(d.profiles[0].type).not.toBe("date");
  });
});

describe("whitespace-only cells count as missing", () => {
  const d = ds(["name"], [{ name: "Alice" }, { name: "   " }, { name: "Bob" }]);
  it("lowers completeness for blank cells", () => {
    expect(d.profiles[0].missingCount).toBe(1);
    expect(d.profiles[0].completeness).toBeCloseTo(66.67, 1);
  });
});

describe("formatted numbers are recognised as numeric", () => {
  it("treats a currency column as a number and sums correctly in stats", () => {
    const d = ds(["amount"], ["1,200", "800", "2,000", "500"].map((amount) => ({ amount })));
    expect(d.profiles[0].type).toBe("number");
    expect(d.profiles[0].max).toBe(2000);
    expect(d.profiles[0].min).toBe(500);
  });
});
