import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import {
  analyze,
  buildContext,
  linearTrend,
  formatNumber,
  detectTrends,
  detectChanges,
  detectOutliers,
  detectQuality,
  detectCorrelations,
  detectTargets,
  detectPerformance,
  detectRisks,
  detectOpportunities,
  type Finding,
} from "./insights";
import type { Row } from "./types";

function makeDataset(name: string, columns: string[], rows: Row[], truncated = false) {
  return profileDataset({ id: "t", name, columns, rows, createdAt: 0, changelog: [], truncated });
}

const ctxOf = (columns: string[], rows: Row[], truncated = false) =>
  buildContext(makeDataset("t.csv", columns, rows, truncated));

const ids = (findings: Finding[]) => findings.map((f) => f.id);

describe("linearTrend", () => {
  it("recovers the slope of a clean line", () => {
    const { slope, r2 } = linearTrend([0, 2, 4, 6, 8]);
    expect(slope).toBeCloseTo(2);
    expect(r2).toBeCloseTo(1);
  });

  it("reports no trend for a flat series", () => {
    expect(linearTrend([5, 5, 5, 5])).toEqual({ slope: 0, r2: 0 });
  });

  it("gives a low r2 to a noisy series", () => {
    expect(linearTrend([10, 1, 9, 2, 8, 3]).r2).toBeLessThan(0.5);
  });
});

describe("formatNumber", () => {
  it("compacts large magnitudes and keeps small ones readable", () => {
    expect(formatNumber(1_500_000)).toBe("1.50M");
    expect(formatNumber(12_500)).toBe("12.5K");
    expect(formatNumber(950)).toBe("950");
    expect(formatNumber(-2_400_000_000)).toBe("-2.40B");
    expect(formatNumber(3.14159)).toBe("3.14");
  });
});

describe("detectTrends", () => {
  it("flags a sustained rise with direction, impact, and an action", () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, "0")}-01`,
      revenue: 100 + i * 50,
    }));
    const [finding] = detectTrends(ctxOf(["date", "revenue"], rows));
    expect(finding.kind).toBe("trend");
    expect(finding.severity).toBe("positive");
    expect(finding.title).toContain("trending up");
    expect(finding.impact).toBeTruthy();
    expect(finding.recommendation).toBeTruthy();
  });

  it("flags a decline as a warning", () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, "0")}-01`,
      revenue: 1000 - i * 50,
    }));
    const [finding] = detectTrends(ctxOf(["date", "revenue"], rows));
    expect(finding.severity).toBe("warning");
    expect(finding.title).toContain("trending down");
  });

  it("stays silent when the series barely moves", () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, "0")}-01`,
      revenue: 1000 + (i % 2),
    }));
    expect(detectTrends(ctxOf(["date", "revenue"], rows))).toHaveLength(0);
  });

  it("stays silent without a date column", () => {
    expect(detectTrends(ctxOf(["revenue"], [{ revenue: 1 }, { revenue: 900 }]))).toHaveLength(0);
  });
});

describe("detectChanges", () => {
  it("names the period where the series broke from its usual step", () => {
    const values = [100, 105, 110, 115, 900, 120, 125, 130];
    const rows: Row[] = values.map((v, i) => ({
      date: `2024-${String(i + 1).padStart(2, "0")}-01`,
      revenue: v,
    }));
    const [finding] = detectChanges(ctxOf(["date", "revenue"], rows));
    expect(finding.kind).toBe("change");
    expect(finding.title).toContain("2024-05");
    expect(finding.what).toContain("times the size of a typical");
  });

  it("stays silent on an evenly-stepping series", () => {
    const rows: Row[] = Array.from({ length: 8 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, "0")}-01`,
      revenue: 100 + i * 10,
    }));
    expect(detectChanges(ctxOf(["date", "revenue"], rows))).toHaveLength(0);
  });
});

describe("detectOutliers", () => {
  const rows: Row[] = [
    ...Array.from({ length: 40 }, (_, i) => ({ region: "North", amount: 100 + (i % 5) })),
    { region: "South", amount: 99999 },
    { region: "South", amount: 88888 },
  ];

  it("quantifies the fence and points at the mean/median gap", () => {
    const [finding] = detectOutliers(ctxOf(["region", "amount"], rows));
    expect(finding.kind).toBe("outlier");
    expect(finding.what).toContain("interquartile");
    expect(finding.impact).toContain("median");
  });

  it("names the segment the extreme rows concentrate in", () => {
    const [finding] = detectOutliers(ctxOf(["region", "amount"], rows));
    expect(finding.why).toContain("South");
    expect(finding.columns).toContain("region");
  });

  it("stays silent when no value breaks the fence", () => {
    const clean: Row[] = Array.from({ length: 30 }, (_, i) => ({ amount: 100 + (i % 10) }));
    expect(detectOutliers(ctxOf(["amount"], clean))).toHaveLength(0);
  });
});

describe("detectQuality", () => {
  it("reports the worst incomplete column with a fix", () => {
    const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({
      name: `n${i}`,
      email: i < 12 ? null : `e${i}@x.com`,
    }));
    const finding = detectQuality(ctxOf(["name", "email"], rows)).find((f) => f.id === "quality_missing")!;
    expect(finding.title).toContain("email");
    expect(finding.severity).toBe("critical");
    expect(finding.recommendation).toContain("Dataset Doctor");
  });

  it("reports duplicates with the inflation they cause", () => {
    const rows: Row[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ a: i, b: "x" })),
      { a: 0, b: "x" },
      { a: 1, b: "x" },
    ];
    const finding = detectQuality(ctxOf(["a", "b"], rows)).find((f) => f.id === "quality_duplicates")!;
    expect(finding.what).toContain("2 rows");
    expect(finding.impact).toContain("overstated");
  });

  it("finds nothing to report on a clean dataset", () => {
    const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({ a: i * 3 + 1, b: `v${i}` }));
    expect(detectQuality(ctxOf(["a", "b"], rows))).toHaveLength(0);
  });
});

describe("detectCorrelations", () => {
  it("reports a strong pair once, not twice", () => {
    const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({
      spend: (i * 37) % 500,
      revenue: ((i * 37) % 500) * 3 + 20,
      noise: (i * 91) % 17,
    }));
    const findings = detectCorrelations(ctxOf(["spend", "revenue", "noise"], rows));
    const spendRevenue = findings.filter((f) => f.columns.includes("spend") && f.columns.includes("revenue"));
    expect(spendRevenue).toHaveLength(1);
    expect(spendRevenue[0].title).toContain("move together");
  });

  it("ignores weak relationships", () => {
    const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({
      a: (i * 7) % 23,
      b: (i * 13) % 29,
    }));
    expect(detectCorrelations(ctxOf(["a", "b"], rows))).toHaveLength(0);
  });
});

describe("detectTargets", () => {
  const rows: Row[] = [
    ...Array.from({ length: 10 }, () => ({ region: "North", sales: 90, sales_target: 100 })),
    ...Array.from({ length: 10 }, () => ({ region: "South", sales: 40, sales_target: 100 })),
  ];

  it("pairs a target column with its actual and reports attainment", () => {
    const [finding] = detectTargets(ctxOf(["region", "sales", "sales_target"], rows));
    expect(finding.kind).toBe("target");
    expect(finding.title).toContain("65%");
    expect(finding.severity).toBe("critical");
  });

  it("points the recovery at the segment furthest behind", () => {
    const [finding] = detectTargets(ctxOf(["region", "sales", "sales_target"], rows));
    expect(finding.recommendation).toContain("South");
  });

  it("marks attainment over 100% as positive", () => {
    const beating: Row[] = Array.from({ length: 20 }, () => ({
      region: "North",
      sales: 130,
      sales_target: 100,
    }));
    const [finding] = detectTargets(ctxOf(["region", "sales", "sales_target"], beating));
    expect(finding.severity).toBe("positive");
    expect(finding.title).toContain("130%");
  });

  it("stays silent when there is no target column", () => {
    expect(detectTargets(ctxOf(["region", "sales"], [{ region: "N", sales: 1 }]))).toHaveLength(0);
  });
});

describe("detectPerformance", () => {
  const rows: Row[] = [
    ...Array.from({ length: 20 }, () => ({ region: "North", revenue: 500 })),
    ...Array.from({ length: 20 }, () => ({ region: "South", revenue: 300 })),
    ...Array.from({ length: 20 }, () => ({ region: "East", revenue: 20 })),
  ];

  it("names the leading segment and its share", () => {
    const top = detectPerformance(ctxOf(["region", "revenue"], rows)).find((f) =>
      f.id.startsWith("perf_top")
    )!;
    expect(top.title).toContain("North");
    expect(top.severity).toBe("positive");
  });

  it("names the laggard and quantifies the recovery upside", () => {
    const bottom = detectPerformance(ctxOf(["region", "revenue"], rows)).find((f) =>
      f.id.startsWith("perf_bottom")
    )!;
    expect(bottom.title).toContain("East");
    expect(bottom.impact).toContain("would add");
  });

  it("does not flag a laggard when segments are level", () => {
    const level: Row[] = ["A", "B", "C"].flatMap((region) =>
      Array.from({ length: 10 }, () => ({ region, revenue: 100 }))
    );
    expect(ids(detectPerformance(ctxOf(["region", "revenue"], level)))).not.toContain(
      "perf_bottom_region"
    );
  });
});

describe("detectRisks", () => {
  it("flags a single segment carrying the business", () => {
    const rows: Row[] = [
      ...Array.from({ length: 30 }, () => ({ client: "Acme", revenue: 1000 })),
      ...Array.from({ length: 10 }, () => ({ client: "Beta", revenue: 100 })),
      ...Array.from({ length: 10 }, () => ({ client: "Gamma", revenue: 100 })),
    ];
    const finding = detectRisks(ctxOf(["client", "revenue"], rows)).find((f) =>
      f.id.startsWith("risk_concentration")
    )!;
    expect(finding.severity).toBe("critical");
    expect(finding.title).toContain("Acme");
    expect(finding.impact).toContain("decline");
  });

  it("flags a dataset too small to conclude from", () => {
    const rows: Row[] = Array.from({ length: 8 }, (_, i) => ({ a: i * 3 }));
    expect(ids(detectRisks(ctxOf(["a"], rows)))).toContain("risk_sample");
  });

  it("treats a truncated import as the most urgent finding", () => {
    const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ a: (i * 7) % 31 }));
    const finding = detectRisks(ctxOf(["a"], rows, true)).find((f) => f.id === "risk_truncated")!;
    expect(finding.severity).toBe("critical");
    expect(finding.score).toBeGreaterThan(90);
  });

  it("stays quiet on a balanced, complete dataset", () => {
    const rows: Row[] = ["A", "B", "C", "D"].flatMap((g) =>
      Array.from({ length: 15 }, () => ({ g, v: 100 }))
    );
    expect(detectRisks(ctxOf(["g", "v"], rows))).toHaveLength(0);
  });
});

describe("detectOpportunities", () => {
  it("finds the fastest growing segment", () => {
    const rows: Row[] = [];
    for (let month = 1; month <= 6; month++) {
      const date = `2024-${String(month).padStart(2, "0")}-01`;
      rows.push({ date, segment: "Rocket", revenue: 100 * month });
      rows.push({ date, segment: "Flat", revenue: 500 });
    }
    const finding = detectOpportunities(ctxOf(["date", "segment", "revenue"], rows)).find((f) =>
      f.id.startsWith("opp_growth")
    )!;
    expect(finding.title).toContain("Rocket");
    expect(finding.severity).toBe("positive");
  });

  it("finds the yield gap between segments of similar volume", () => {
    const rows: Row[] = [
      ...Array.from({ length: 10 }, () => ({ tier: "Gold", revenue: 1000 })),
      ...Array.from({ length: 10 }, () => ({ tier: "Silver", revenue: 600 })),
      ...Array.from({ length: 10 }, () => ({ tier: "Bronze", revenue: 100 })),
    ];
    const finding = detectOpportunities(ctxOf(["tier", "revenue"], rows)).find((f) =>
      f.id.startsWith("opp_yield")
    )!;
    expect(finding.title).toContain("Bronze");
    expect(finding.impact).toContain("no extra volume");
  });
});

describe("analyze", () => {
  const rows: Row[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const region of ["North", "South", "East", "West"]) {
      rows.push({
        date: `2024-${String(month).padStart(2, "0")}-15`,
        region,
        revenue: region === "North" ? 900 + month * 60 : 120,
        units: region === "North" ? 40 : 10,
      });
    }
  }
  const ds = makeDataset("sales.csv", ["date", "region", "revenue", "units"], rows);

  it("ranks findings by score, most urgent first", () => {
    const { findings } = analyze(ds);
    expect(findings.length).toBeGreaterThan(3);
    const scores = findings.map((f) => f.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("gives every finding a stable id and an action", () => {
    const { findings } = analyze(ds);
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
    expect(findings.every((f) => f.recommendation && f.recommendation.length > 0)).toBe(true);
  });

  it("writes an executive summary that names the dataset and its health", () => {
    const { summary } = analyze(ds);
    expect(summary).toContain("sales.csv");
    expect(summary).toContain("Data health");
  });

  it("deduplicates recommendations", () => {
    const { recommendations } = analyze(ds);
    expect(new Set(recommendations).size).toBe(recommendations.length);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it("covers trends, performance, and risk on a realistic dataset", () => {
    const kinds = new Set(analyze(ds).findings.map((f) => f.kind));
    expect(kinds).toContain("trend");
    expect(kinds).toContain("performance");
    expect(kinds).toContain("risk");
  });

  it("handles an empty dataset without throwing", () => {
    const empty = makeDataset("empty.csv", ["a"], []);
    const result = analyze(empty);
    expect(result.findings).toEqual([]);
    expect(result.summary).toContain("no rows");
  });

  it("handles a single-column, single-row dataset without throwing", () => {
    const tiny = makeDataset("tiny.csv", ["a"], [{ a: 1 }]);
    expect(() => analyze(tiny)).not.toThrow();
  });
});
