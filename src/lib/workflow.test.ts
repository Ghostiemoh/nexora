import { describe, it, expect } from "vitest";
import {
  captureWorkflow,
  applyWorkflow,
  describeCleanOp,
  describeChart,
  summarizeWorkflow,
  moveStep,
  removeStep,
  stepColumns,
  serializeWorkflow,
  parseWorkflow,
  type WorkflowTemplate,
} from "./workflow";
import type { CleanOp, Row } from "./types";
import type { ChartConfig } from "./chart-recommend";

const ops: CleanOp[] = [
  { kind: "dropDuplicates" },
  { kind: "trimWhitespace" },
  { kind: "fillMissing", column: "amount", strategy: "median" },
  { kind: "dropColumn", column: "__EMPTY" },
];

const charts: ChartConfig[] = [
  { type: "bar", x: "region", y: "amount", series: null, agg: "sum" },
  { type: "line", x: "date", y: "amount", series: null, agg: "sum" },
];

const template = (): WorkflowTemplate =>
  captureWorkflow({
    id: "wf_1",
    name: "Monthly sales cleanup",
    description: "What we run on every export",
    source: "sales_june.csv",
    ops,
    charts,
    at: 1_700_000_000_000,
  });

describe("describeCleanOp", () => {
  it("gives every operation kind a readable line", () => {
    const all: CleanOp[] = [
      { kind: "dropDuplicates" },
      { kind: "dropEmptyRows" },
      { kind: "trimWhitespace" },
      { kind: "fixEncoding" },
      { kind: "fillMissing", column: "a", strategy: "mode" },
      { kind: "standardizeCase", column: "a" },
      { kind: "mergeValues", column: "a", mapping: { x: "y" } },
      { kind: "convertExcelDates", column: "a" },
      { kind: "dropColumn", column: "a" },
      { kind: "findReplace", column: null, find: "x", replace: "y" },
      { kind: "splitColumn", column: "a", delimiter: "," },
    ];
    for (const op of all) {
      expect(describeCleanOp(op).length).toBeGreaterThan(4);
    }
    expect(describeCleanOp({ kind: "fillMissing", column: "amount", strategy: "median" })).toBe(
      "Fill missing values in 'amount' by median"
    );
  });
});

describe("describeChart", () => {
  it("reads as a sentence for a measure and for a count", () => {
    expect(describeChart(charts[0])).toBe("bar chart: sum of amount by region");
    expect(describeChart({ type: "pie", x: "region", y: null, agg: "count" })).toBe(
      "pie chart: row count by region"
    );
  });
});

describe("captureWorkflow", () => {
  it("records cleaning steps first, then charts, in order", () => {
    const wf = template();
    expect(wf.steps).toHaveLength(6);
    expect(wf.steps.slice(0, 4).every((s) => s.kind === "clean")).toBe(true);
    expect(wf.steps.slice(4).every((s) => s.kind === "chart")).toBe(true);
    expect(wf.steps[0].label).toBe("Remove duplicate rows");
  });

  it("gives every step a unique id", () => {
    const wf = template();
    expect(new Set(wf.steps.map((s) => s.id)).size).toBe(wf.steps.length);
  });

  it("falls back to a placeholder name rather than saving an empty one", () => {
    const wf = captureWorkflow({ id: "x", name: "   ", source: "a.csv", ops: [], at: 0 });
    expect(wf.name).toBe("Untitled workflow");
  });

  it("keeps the source dataset for provenance", () => {
    expect(template().source).toBe("sales_june.csv");
  });
});

describe("summarizeWorkflow", () => {
  it("counts both kinds of step", () => {
    expect(summarizeWorkflow(template())).toBe("4 cleaning steps, 2 charts");
  });

  it("says so when a template is empty", () => {
    const empty = captureWorkflow({ id: "x", name: "n", source: "s", ops: [], at: 0 });
    expect(summarizeWorkflow(empty)).toBe("No steps yet");
  });
});

describe("stepColumns", () => {
  it("reports the column a cleaning step needs", () => {
    const wf = template();
    expect(stepColumns(wf.steps[2])).toEqual(["amount"]);
    expect(stepColumns(wf.steps[0])).toEqual([]);
  });

  it("reports every column a chart step needs", () => {
    const wf = template();
    expect(stepColumns(wf.steps[4]).sort()).toEqual(["amount", "region"]);
  });
});

describe("editing", () => {
  it("moves a step and leaves the rest in order", () => {
    const steps = template().steps;
    const moved = moveStep(steps, 0, 2);
    expect(moved[2].id).toBe(steps[0].id);
    expect(moved).toHaveLength(steps.length);
  });

  it("ignores an out-of-range move", () => {
    const steps = template().steps;
    expect(moveStep(steps, 0, 99)).toBe(steps);
    expect(moveStep(steps, -1, 0)).toBe(steps);
  });

  it("removes a step by id without touching the others", () => {
    const steps = template().steps;
    const next = removeStep(steps, steps[1].id);
    expect(next).toHaveLength(steps.length - 1);
    expect(next.find((s) => s.id === steps[1].id)).toBeUndefined();
  });
});

describe("applyWorkflow", () => {
  const rows: Row[] = [
    { __EMPTY: 0, region: " North ", amount: 100, date: "2024-01-01" },
    { __EMPTY: 1, region: "South", amount: null, date: "2024-02-01" },
    { __EMPTY: 2, region: "South", amount: 300, date: "2024-03-01" },
  ];
  const columns = ["__EMPTY", "region", "amount", "date"];

  it("replays the cleaning steps in order", () => {
    const run = applyWorkflow(rows, columns, template());
    expect(run.applied).toBe(4);
    expect(run.columns).toEqual(["region", "amount", "date"]);
    expect(run.rows[0].region).toBe("North");
    expect(run.rows[1].amount).toBe(200);
  });

  it("returns the charts whose columns survived, ready to pin", () => {
    const run = applyWorkflow(rows, columns, template());
    expect(run.charts).toHaveLength(2);
    expect(run.charts[0].x).toBe("region");
  });

  it("skips steps whose column is missing instead of failing the run", () => {
    const drifted: Row[] = [{ region: "North", total: 10 }];
    const run = applyWorkflow(drifted, ["region", "total"], template());
    expect(run.applied).toBeGreaterThan(0);
    expect(run.skipped).toBeGreaterThan(0);
    expect(run.skippedLabels.length).toBe(run.skipped);
    expect(run.charts).toHaveLength(0);
  });

  it("leaves the data alone for a template with no steps", () => {
    const empty = captureWorkflow({ id: "x", name: "n", source: "s", ops: [], at: 0 });
    const run = applyWorkflow(rows, columns, empty);
    expect(run.rows).toEqual(rows);
    expect(run.applied).toBe(0);
    expect(run.charts).toEqual([]);
  });
});

describe("portability", () => {
  it("round-trips a template through JSON unchanged", () => {
    const wf = template();
    expect(parseWorkflow(serializeWorkflow(wf))).toEqual(wf);
  });

  it("rejects bad files with a message a user can act on", () => {
    expect(() => parseWorkflow("nope")).toThrow("Not valid JSON");
    expect(() => parseWorkflow('{"version":1}')).toThrow("Not a Nexora workflow");
    expect(() =>
      parseWorkflow(
        JSON.stringify({
          version: 1,
          kind: "nexora-workflow",
          template: { name: "x", steps: [{ kind: "launchMissile" }] },
        })
      )
    ).toThrow("unknown step");
    expect(() =>
      parseWorkflow(
        JSON.stringify({
          version: 1,
          kind: "nexora-workflow",
          template: { name: "x", steps: [{ kind: "clean", label: "Drop dupes" }] },
        })
      )
    ).toThrow("has no operation");
  });
});
