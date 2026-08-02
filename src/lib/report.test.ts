import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import { buildDashboard } from "./auto-dashboard";
import { analyze } from "./insights";
import { buildReport, reportToMarkdown, reportToHtml, type Report } from "./report";
import type { Row } from "./types";

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

const ds = profileDataset({
  id: "t",
  name: "sales.csv",
  columns: ["date", "region", "revenue", "units"],
  rows,
  createdAt: 0,
  changelog: ["Dataset imported successfully."],
});

const makeReport = (): Report =>
  buildReport(ds, analyze(ds), buildDashboard(ds), "2026-08-02T09:00:00.000Z");

describe("buildReport", () => {
  it("produces every section the brief asks for, in reading order", () => {
    expect(makeReport().sections.map((s) => s.id)).toEqual([
      "executive-summary",
      "dataset-overview",
      "data-quality",
      "kpis",
      "trends",
      "visualizations",
      "findings",
      "root-cause",
      "recommendations",
      "conclusion",
    ]);
  });

  it("titles itself from the dataset without the file extension", () => {
    const report = makeReport();
    expect(report.title).toBe("sales analysis report");
    expect(report.datasetName).toBe("sales.csv");
  });

  it("never reads the clock itself", () => {
    expect(makeReport().generatedAt).toBe("2026-08-02T09:00:00.000Z");
  });

  it("includes every section by default", () => {
    expect(makeReport().sections.every((s) => s.include)).toBe(true);
  });

  it("gives the overview a row per column", () => {
    const overview = makeReport().sections.find((s) => s.id === "dataset-overview")!;
    expect(overview.table!.rows).toHaveLength(ds.columns.length);
    expect(overview.body).toContain("48 rows");
  });

  it("scores all four quality dimensions", () => {
    const quality = makeReport().sections.find((s) => s.id === "data-quality")!;
    expect(quality.table!.rows.map((r) => r[0])).toEqual([
      "Completeness",
      "Accuracy",
      "Validity",
      "Consistency",
    ]);
  });

  it("carries the chart ids so the UI can render the visual appendix", () => {
    const visuals = makeReport().sections.find((s) => s.id === "visualizations")!;
    expect(visuals.chartIds!.length).toBeGreaterThan(0);
    expect(visuals.chartIds).toEqual(buildDashboard(ds).charts.map((c) => c.id));
  });

  it("lists every finding with its evidence and impact", () => {
    const intel = analyze(ds);
    const findings = buildReport(ds, intel, buildDashboard(ds), "2026-08-02T09:00:00.000Z").sections.find(
      (s) => s.id === "findings"
    )!;
    expect(findings.table!.rows).toHaveLength(intel.findings.length);
    expect(findings.table!.headers).toEqual(["Priority", "Finding", "Evidence", "Impact"]);
  });

  it("marks recommendations as ordered without baking numbers into the text", () => {
    const recs = makeReport().sections.find((s) => s.id === "recommendations")!;
    expect(recs.ordered).toBe(true);
    expect(recs.bullets![0]).not.toMatch(/^\d+\. /);
  });

  it("degrades to explanatory copy on a dataset with nothing to say", () => {
    const bare = profileDataset({
      id: "b",
      name: "bare.csv",
      columns: ["note"],
      rows: [{ note: "hello" }],
      createdAt: 0,
      changelog: [],
    });
    const report = buildReport(bare, analyze(bare), buildDashboard(bare), "2026-08-02T09:00:00.000Z");
    expect(report.sections).toHaveLength(10);
    expect(report.sections.find((s) => s.id === "trends")!.body).toContain("no time-based trend");
  });
});

describe("reportToMarkdown", () => {
  it("renders headings, prose, bullets, and tables", () => {
    const md = reportToMarkdown(makeReport());
    expect(md).toContain("# sales analysis report");
    expect(md).toContain("## Executive summary");
    expect(md).toContain("| Column | Type | Complete | Distinct | Missing |");
    expect(md).toMatch(/^- /m);
  });

  it("omits sections the user unchecked", () => {
    const report = makeReport();
    report.sections.find((s) => s.id === "recommendations")!.include = false;
    const md = reportToMarkdown(report);
    expect(md).not.toContain("## Recommendations");
    expect(md).toContain("## Conclusion");
  });

  it("carries edited prose through to the export", () => {
    const report = makeReport();
    report.sections[0].body = "Rewritten by the analyst before sending.";
    expect(reportToMarkdown(report)).toContain("Rewritten by the analyst before sending.");
  });

  it("escapes pipes so a stray value cannot break a table", () => {
    const report = makeReport();
    report.sections[1].table = { headers: ["a"], rows: [["x | y"]] };
    expect(reportToMarkdown(report)).toContain("x \\| y");
  });

  it("never leaves a run of blank lines", () => {
    expect(reportToMarkdown(makeReport())).not.toMatch(/\n{3}/);
  });

  it("numbers ordered sections and bullets the rest", () => {
    const md = reportToMarkdown(makeReport());
    const recommendations = md.split("## Recommendations")[1].split("## ")[0];
    expect(recommendations).toMatch(/^1\. /m);
    expect(recommendations).not.toMatch(/^- /m);
    expect(md.split("## Root cause analysis")[1]).toMatch(/^- /m);
  });
});

describe("reportToHtml", () => {
  it("produces a self-contained document", () => {
    const html = reportToHtml(makeReport());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<h1>sales analysis report</h1>");
    expect(html).toContain("<table>");
  });

  it("escapes markup so dataset values cannot inject tags", () => {
    const report = makeReport();
    report.sections[0].body = '<script>alert("x")</script>';
    const html = reportToHtml(report);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits sections the user unchecked", () => {
    const report = makeReport();
    report.sections.find((s) => s.id === "conclusion")!.include = false;
    expect(reportToHtml(report)).not.toContain("<h2>Conclusion</h2>");
  });
});
