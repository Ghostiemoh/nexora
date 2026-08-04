/* Workflow templates: a whole analysis captured once and replayed on the next
 * export of the same shape. A template is an ordered list of steps, each either
 * a cleaning operation or a chart to pin, so "import, clean, rename, chart,
 * dashboard" becomes a single click on next month's file.
 *
 * Templates survive schema drift: a step whose column is gone is skipped and
 * reported rather than failing the whole run. */

import type { CleanOp, Row } from "./types";
import type { ChartConfig } from "./chart-recommend";
import { replayRecipe } from "./recipe";

export type WorkflowStepKind = "clean" | "chart";

export interface WorkflowStep {
  id: string;
  kind: WorkflowStepKind;
  /** what this step does, in the words shown in the editor */
  label: string;
  op?: CleanOp;
  chart?: ChartConfig;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** the dataset the template was captured from, for provenance */
  source: string;
  steps: WorkflowStep[];
}

/* ── describing steps ── */

/** One human-readable line per cleaning operation, shared by the workflow
 *  editor, the audit log, and the exported template file. */
export function describeCleanOp(op: CleanOp): string {
  switch (op.kind) {
    case "dropDuplicates":
      return "Remove duplicate rows";
    case "dropEmptyRows":
      return "Remove completely empty rows";
    case "trimWhitespace":
      return "Normalize whitespace in text columns";
    case "fixEncoding":
      return "Repair broken text encoding";
    case "fillMissing":
      return `Fill missing values in '${op.column}' by ${op.strategy}`;
    case "standardizeCase":
      return `Standardize casing in '${op.column}'`;
    case "mergeValues":
      return `Merge ${Object.keys(op.mapping).length} variant value(s) in '${op.column}'`;
    case "convertExcelDates":
      return `Convert Excel serial dates in '${op.column}'`;
    case "dropColumn":
      return `Drop column '${op.column}'`;
    case "findReplace":
      return `Replace "${op.find}" with "${op.replace}" in ${op.column ? `'${op.column}'` : "all text columns"}`;
    case "splitColumn":
      return `Split '${op.column}' on "${op.delimiter}"`;
    case "capOutliers":
      return `Cap outliers in '${op.column}' at the 1.5×IQR fences`;
    case "dropOutlierRows":
      return `Remove rows with an out-of-fence value in '${op.column}'`;
  }
}

export function describeChart(chart: ChartConfig): string {
  const measure = chart.y ? `${chart.agg} of ${chart.y}` : "row count";
  return `${chart.type} chart: ${measure}${chart.x ? ` by ${chart.x}` : ""}${
    chart.series ? ` and ${chart.series}` : ""
  }`;
}

/** Columns a step needs. A step whose columns are gone cannot be replayed. */
export function stepColumns(step: WorkflowStep): string[] {
  if (step.kind === "clean" && step.op) {
    return "column" in step.op && step.op.column ? [step.op.column] : [];
  }
  if (step.kind === "chart" && step.chart) {
    return [step.chart.x, step.chart.y, step.chart.series ?? null].filter(
      (c): c is string => c !== null
    );
  }
  return [];
}

/* ── capture ── */

let stepCounter = 0;
function makeStepId(prefix: string): string {
  stepCounter += 1;
  return `${prefix}_${stepCounter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Turn a dataset's applied recipe and pinned charts into a reusable template. */
export function captureWorkflow(input: {
  id: string;
  name: string;
  description?: string;
  source: string;
  ops: CleanOp[];
  charts?: ChartConfig[];
  at: number;
}): WorkflowTemplate {
  const steps: WorkflowStep[] = [
    ...input.ops.map((op) => ({
      id: makeStepId("step"),
      kind: "clean" as const,
      label: describeCleanOp(op),
      op,
    })),
    ...(input.charts ?? []).map((chart) => ({
      id: makeStepId("step"),
      kind: "chart" as const,
      label: describeChart(chart),
      chart,
    })),
  ];

  return {
    id: input.id,
    name: input.name.trim() || "Untitled workflow",
    description: input.description?.trim() ?? "",
    createdAt: input.at,
    updatedAt: input.at,
    source: input.source,
    steps,
  };
}

/** "3 cleaning steps, 2 charts" for the template card. */
export function summarizeWorkflow(template: WorkflowTemplate): string {
  const cleans = template.steps.filter((s) => s.kind === "clean").length;
  const charts = template.steps.filter((s) => s.kind === "chart").length;
  const bits: string[] = [];
  if (cleans > 0) bits.push(`${cleans} cleaning step${cleans === 1 ? "" : "s"}`);
  if (charts > 0) bits.push(`${charts} chart${charts === 1 ? "" : "s"}`);
  return bits.length > 0 ? bits.join(", ") : "No steps yet";
}

/* ── editing ── */

/** Move a step to a new position. Out-of-range indices leave the list alone. */
export function moveStep(steps: WorkflowStep[], from: number, to: number): WorkflowStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) {
    return steps;
  }
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function removeStep(steps: WorkflowStep[], id: string): WorkflowStep[] {
  return steps.filter((s) => s.id !== id);
}

/* ── application ── */

export interface WorkflowRun {
  rows: Row[];
  columns: string[];
  /** cleaning steps that ran */
  applied: number;
  /** steps skipped because their column is not in this dataset */
  skipped: number;
  /** chart configs whose columns all exist, ready to pin */
  charts: ChartConfig[];
  /** labels of every skipped step, shown to the user after the run */
  skippedLabels: string[];
}

/** Replay a template against a dataset. Cleaning runs in order, then the charts
 *  that still make sense against the resulting schema are returned. */
export function applyWorkflow(
  rows: Row[],
  columns: string[],
  template: WorkflowTemplate
): WorkflowRun {
  const cleanSteps = template.steps.filter((s) => s.kind === "clean" && s.op);
  const result = replayRecipe(rows, columns, cleanSteps.map((s) => s.op!));

  const skippedLabels: string[] = [];
  for (const step of cleanSteps) {
    const needed = stepColumns(step);
    if (needed.some((c) => !columns.includes(c))) skippedLabels.push(step.label);
  }

  const charts: ChartConfig[] = [];
  for (const step of template.steps) {
    if (step.kind !== "chart" || !step.chart) continue;
    const needed = stepColumns(step);
    if (needed.every((c) => result.columns.includes(c))) charts.push(step.chart);
    else skippedLabels.push(step.label);
  }

  return {
    rows: result.rows,
    columns: result.columns,
    applied: result.applied,
    skipped: result.skipped + (template.steps.length - cleanSteps.length - charts.length),
    charts,
    skippedLabels,
  };
}

/* ── portability ── */

export interface WorkflowFile {
  version: 1;
  kind: "nexora-workflow";
  template: WorkflowTemplate;
}

export function serializeWorkflow(template: WorkflowTemplate): string {
  const file: WorkflowFile = { version: 1, kind: "nexora-workflow", template };
  return JSON.stringify(file, null, 2);
}

const STEP_KINDS = new Set<WorkflowStepKind>(["clean", "chart"]);

/** Parse a workflow file, throwing a message a user can act on. */
export function parseWorkflow(json: string): WorkflowTemplate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Not valid JSON.");
  }

  const file = parsed as Partial<WorkflowFile>;
  if (file.version !== 1 || file.kind !== "nexora-workflow" || !file.template) {
    throw new Error("Not a Nexora workflow file.");
  }

  const t = file.template;
  if (typeof t.name !== "string" || !Array.isArray(t.steps)) {
    throw new Error("Workflow is missing a name or its steps.");
  }

  for (const step of t.steps) {
    if (!step || !STEP_KINDS.has(step.kind)) {
      throw new Error(`Workflow contains an unknown step: ${JSON.stringify(step)}`);
    }
    if (step.kind === "clean" && !step.op) {
      throw new Error(`Cleaning step "${step.label ?? "unnamed"}" has no operation.`);
    }
    if (step.kind === "chart" && !step.chart) {
      throw new Error(`Chart step "${step.label ?? "unnamed"}" has no chart configuration.`);
    }
  }

  return {
    ...t,
    description: t.description ?? "",
    source: t.source ?? "unknown",
    createdAt: t.createdAt ?? 0,
    updatedAt: t.updatedAt ?? 0,
  };
}
