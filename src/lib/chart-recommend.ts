/* Chart intelligence: given a profiled dataset, decide which visualization
 * actually fits the data types, rank the alternatives, and build the series for
 * whichever type the user switches to. Pure logic, no UI, so the recommendation
 * rules are unit-testable. */

import type { Dataset, Row } from "./types";
import { parseNumeric } from "./number";
import { parseStrictDate } from "./profile";
import { isExcelDateSerial } from "./clean";
import {
  numericColumns,
  dateColumns,
  categoricalColumns,
  valueCounts,
  binNumeric,
  bucketByDate,
} from "./auto-dashboard";

export type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "area"
  | "scatter"
  | "histogram"
  | "doughnut"
  | "heatmap";

export const CHART_TYPES: ChartType[] = [
  "bar",
  "line",
  "pie",
  "area",
  "scatter",
  "histogram",
  "doughnut",
  "heatmap",
];

export const CHART_LABELS: Record<ChartType, string> = {
  bar: "Bar",
  line: "Line",
  pie: "Pie",
  area: "Area",
  scatter: "Scatter",
  histogram: "Histogram",
  doughnut: "Doughnut",
  heatmap: "Heatmap",
};

export type Aggregation = "sum" | "avg" | "count" | "min" | "max";

export const AGGREGATIONS: Aggregation[] = ["sum", "avg", "count", "min", "max"];

export interface ChartConfig {
  type: ChartType;
  /** dimension or date column on the category axis; scatter uses it as numeric X */
  x: string | null;
  /** measure on the value axis; null means "count rows" */
  y: string | null;
  /** second dimension, only used by heatmap */
  series?: string | null;
  agg: Aggregation;
}

/* ── data shapes handed to the renderer ── */

export interface CategorySeries {
  shape: "category";
  data: { name: string; value: number }[];
  /** the column a click on a slice or bar should filter on */
  filterColumn?: string;
}
export interface TimeSeries {
  shape: "time";
  data: { name: string; value: number }[];
}
export interface ScatterSeries {
  shape: "scatter";
  data: { x: number; y: number }[];
  /** points beyond the render cap that were dropped */
  omitted: number;
}
export interface BinSeries {
  shape: "bins";
  data: { name: string; value: number }[];
}
export interface MatrixSeries {
  shape: "matrix";
  rows: string[];
  cols: string[];
  cells: { row: string; col: string; value: number }[];
  max: number;
  min: number;
}
export type ChartSeries =
  | CategorySeries
  | TimeSeries
  | ScatterSeries
  | BinSeries
  | MatrixSeries;

/** Scatter plots stop being readable long before they stop being renderable. */
const SCATTER_CAP = 2000;
const CATEGORY_CAP = 24;
const PIE_MAX_SLICES = 8;
const HEATMAP_CAP = 14;

/* ── column roles ── */

export interface ColumnRoles {
  /** numeric columns worth summing (row indexes and IDs excluded) */
  measures: string[];
  /** category-like columns worth grouping by */
  dimensions: string[];
  /** real date columns */
  dates: string[];
}

export function columnRoles(ds: Dataset): ColumnRoles {
  return {
    measures: numericColumns(ds).map((p) => p.name),
    dimensions: categoricalColumns(ds).map((p) => p.name),
    dates: dateColumns(ds).map((p) => p.name),
  };
}

function distinctCount(ds: Dataset, column: string): number {
  return ds.profiles.find((p) => p.name === column)?.uniqueCount ?? 0;
}

/* ── aggregation ── */

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Group rows by a column and reduce a measure with the chosen aggregation.
 *  `valueCol === null` counts rows, which is what "count" means for any column. */
export function aggregateBy(
  rows: Row[],
  catCol: string,
  valueCol: string | null,
  agg: Aggregation
): { name: string; value: number }[] {
  if (valueCol === null || agg === "count") {
    return valueCounts(rows, catCol);
  }

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const cat = row[catCol];
    if (isBlank(cat)) continue;
    const n = parseNumeric(row[valueCol]);
    if (n === null) continue;
    const key = String(cat).trim();
    const bucket = groups.get(key);
    if (bucket) bucket.push(n);
    else groups.set(key, [n]);
  }

  const out: { name: string; value: number }[] = [];
  for (const [name, values] of groups) {
    out.push({ name, value: reduceValues(values, agg) });
  }
  return out.sort((a, b) => b.value - a.value);
}

function reduceValues(values: number[], agg: Aggregation): number {
  if (values.length === 0) return 0;
  if (agg === "min") return Math.min(...values);
  if (agg === "max") return Math.max(...values);
  const sum = values.reduce((s, v) => s + v, 0);
  if (agg === "avg") return round2(sum / values.length);
  return round2(sum);
}

const round2 = (n: number) => (Number.isInteger(n) ? n : parseFloat(n.toFixed(2)));

/* ── compatibility ── */

export interface TypeAvailability {
  type: ChartType;
  ok: boolean;
  /** why it is unavailable, shown on the disabled switcher button */
  reason?: string;
}

function isNumericCol(roles: ColumnRoles, col: string | null): boolean {
  return col !== null && roles.measures.includes(col);
}
function isDateCol(roles: ColumnRoles, col: string | null): boolean {
  return col !== null && roles.dates.includes(col);
}

/** Part-to-whole charts are meaningless when slices can be negative, so a
 *  measure that dips below zero disqualifies pie and doughnut. */
function hasNegativeValues(ds: Dataset, col: string | null): boolean {
  if (col === null) return false;
  const p = ds.profiles.find((c) => c.name === col);
  return p?.min !== undefined && p.min < 0;
}

/** Which of the eight chart types can render this x/y pair, and why not. */
export function compatibleTypes(ds: Dataset, config: ChartConfig): TypeAvailability[] {
  const roles = columnRoles(ds);
  const { x, y } = config;
  const xIsNumber = isNumericCol(roles, x);
  const xIsDate = isDateCol(roles, x);
  const yIsNumber = isNumericCol(roles, y);
  const hasDimension = x !== null && !xIsNumber;
  const xDistinct = x ? distinctCount(ds, x) : 0;

  const categoryOk = hasDimension || xIsDate;

  return CHART_TYPES.map((type): TypeAvailability => {
    switch (type) {
      case "bar":
      case "line":
      case "area":
        return categoryOk
          ? { type, ok: true }
          : { type, ok: false, reason: "Pick a category or date column for the X axis." };

      case "pie":
      case "doughnut":
        if (!hasDimension) {
          return { type, ok: false, reason: "Needs a category column to split by." };
        }
        if (xDistinct > PIE_MAX_SLICES * 3) {
          return {
            type,
            ok: false,
            reason: `${xDistinct} distinct values is too many slices to read.`,
          };
        }
        if (config.agg !== "count" && hasNegativeValues(ds, y)) {
          return {
            type,
            ok: false,
            reason: `${y} contains negative values, which cannot be drawn as a share of a whole.`,
          };
        }
        return { type, ok: true };

      case "scatter":
        return xIsNumber && yIsNumber
          ? { type, ok: true }
          : { type, ok: false, reason: "Needs a numeric column on both axes." };

      case "histogram":
        return xIsNumber || yIsNumber
          ? { type, ok: true }
          : { type, ok: false, reason: "Needs a numeric column to bin." };

      case "heatmap":
        return hasDimension && config.series
          ? { type, ok: true }
          : { type, ok: false, reason: "Needs a second category column to cross-tabulate." };
    }
  });
}

/* ── recommendation ── */

export interface ChartRecommendation {
  config: ChartConfig;
  /** plain-language justification shown next to the "Recommended" badge */
  reason: string;
  /** other types that also fit, best first */
  alternatives: ChartType[];
}

/** The best chart type for a chosen pair of columns, with the reasoning. */
export function recommendTypeFor(
  ds: Dataset,
  x: string | null,
  y: string | null,
  series?: string | null
): { type: ChartType; reason: string } {
  const roles = columnRoles(ds);
  const xIsNumber = isNumericCol(roles, x);
  const xIsDate = isDateCol(roles, x);
  const yIsNumber = isNumericCol(roles, y);
  const xDistinct = x ? distinctCount(ds, x) : 0;

  if (xIsDate) {
    return {
      type: "line",
      reason: `${x} is a date, so a line chart shows how ${y ?? "the record count"} moves over time.`,
    };
  }
  if (xIsNumber && yIsNumber) {
    return {
      type: "scatter",
      reason: `${x} and ${y} are both numeric, so a scatter plot exposes the relationship between them.`,
    };
  }
  if (xIsNumber && !yIsNumber) {
    return {
      type: "histogram",
      reason: `${x} is a single numeric column, so a histogram shows how its values are distributed.`,
    };
  }
  if (x !== null && series) {
    return {
      type: "heatmap",
      reason: `${x} against ${series} is a two-dimensional breakdown, which reads best as a heatmap.`,
    };
  }
  if (x !== null && xDistinct > 0 && xDistinct <= 6 && !hasNegativeValues(ds, y)) {
    return {
      type: "doughnut",
      reason: `${x} has only ${xDistinct} values, so a doughnut chart reads as a share of the whole.`,
    };
  }
  return {
    type: "bar",
    reason:
      x === null
        ? "A ranked bar chart is the safe default until you choose columns."
        : `${x} has ${xDistinct} values, so a ranked bar chart compares them most clearly.`,
  };
}

/** The single best chart for a dataset the user has not configured yet. */
export function recommendChart(ds: Dataset): ChartRecommendation {
  const roles = columnRoles(ds);
  const measure = roles.measures[0] ?? null;

  // A date column plus a measure is the most informative default there is.
  const dateWithSpread = roles.dates.find((d) => {
    const p = ds.profiles.find((c) => c.name === d);
    return p?.dateMin !== p?.dateMax;
  });

  let x: string | null;
  let series: string | null = null;

  if (dateWithSpread) {
    x = dateWithSpread;
  } else if (roles.dimensions.length > 0) {
    x = roles.dimensions[0];
    series = roles.dimensions[1] ?? null;
  } else if (measure) {
    x = measure;
  } else {
    x = ds.columns[0] ?? null;
  }

  // The second dimension rides along so the heatmap is offered as an
  // alternative, but it never wins the default: one dimension reads clearer.
  const y = x !== null && x === measure ? null : measure;
  const { type, reason } = recommendTypeFor(ds, x, y, null);

  const config: ChartConfig = {
    type,
    x,
    y,
    series,
    agg: y === null ? "count" : "sum",
  };

  const alternatives = compatibleTypes(ds, config)
    .filter((t) => t.ok && t.type !== type)
    .map((t) => t.type);

  return { config, reason, alternatives };
}

/* ── series building ── */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function readDate(value: unknown): number | null {
  const t = parseStrictDate(value);
  if (t !== null) return t;
  const n = parseNumeric(value);
  if (n !== null && isExcelDateSerial(n)) return EXCEL_EPOCH_MS + n * 86_400_000;
  return null;
}

/** Build the series for a config. Returns null when the config cannot be
 *  rendered, which is the same condition compatibleTypes reports. */
export function buildChartSeries(
  ds: Dataset,
  config: ChartConfig,
  rowsOverride?: Row[]
): ChartSeries | null {
  const rows = rowsOverride ?? ds.rows;
  const roles = columnRoles(ds);
  const { type, x, y, series, agg } = config;

  if (type === "scatter") {
    if (!isNumericCol(roles, x) || !isNumericCol(roles, y)) return null;
    const points: { x: number; y: number }[] = [];
    let omitted = 0;
    for (const row of rows) {
      const a = parseNumeric(row[x!]);
      const b = parseNumeric(row[y!]);
      if (a === null || b === null) continue;
      if (points.length < SCATTER_CAP) points.push({ x: a, y: b });
      else omitted++;
    }
    return points.length > 0 ? { shape: "scatter", data: points, omitted } : null;
  }

  if (type === "histogram") {
    const column = isNumericCol(roles, y) ? y! : isNumericCol(roles, x) ? x! : null;
    if (column === null) return null;
    const bins = binNumeric(rows, column);
    return bins.length > 0
      ? { shape: "bins", data: bins.map((b) => ({ name: b.bin, value: b.count })) }
      : null;
  }

  if (type === "heatmap") {
    if (x === null || !series) return null;
    return buildMatrix(rows, x, series, y, agg);
  }

  if (x === null) return null;

  // Date axes bucket by day or month; everything else groups by value.
  if (isDateCol(roles, x)) {
    const buckets =
      agg === "count" || y === null
        ? bucketByDate(rows, x, null)
        : agg === "sum"
          ? bucketByDate(rows, x, y)
          : bucketByDateAgg(rows, x, y, agg);
    return buckets.length > 0
      ? { shape: "time", data: buckets.map((b) => ({ name: b.date, value: b.value })) }
      : null;
  }

  const grouped = aggregateBy(rows, x, y, agg);
  if (grouped.length === 0) return null;

  const limit = type === "pie" || type === "doughnut" ? PIE_MAX_SLICES : CATEGORY_CAP;
  return { shape: "category", data: foldOther(grouped, limit), filterColumn: x };
}

/** Keep the top N and fold the tail into "Other" so a long tail never buries
 *  the categories that matter. */
function foldOther(
  data: { name: string; value: number }[],
  limit: number
): { name: string; value: number }[] {
  if (data.length <= limit) return data;
  const head = data.slice(0, limit);
  const rest = data.slice(limit).reduce((s, d) => s + d.value, 0);
  return [...head, { name: "Other", value: round2(rest) }];
}

/** Date bucketing for avg/min/max, which bucketByDate does not cover. */
function bucketByDateAgg(
  rows: Row[],
  dateCol: string,
  valueCol: string | null,
  agg: Aggregation
): { date: string; value: number }[] {
  if (valueCol === null) return bucketByDate(rows, dateCol, null);

  const stamps: { t: number; v: number }[] = [];
  for (const row of rows) {
    const t = readDate(row[dateCol]);
    const v = parseNumeric(row[valueCol]);
    if (t === null || v === null) continue;
    stamps.push({ t, v });
  }
  if (stamps.length === 0) return [];

  const times = stamps.map((s) => s.t);
  const monthly = (Math.max(...times) - Math.min(...times)) / 86_400_000 > 92;

  const buckets = new Map<string, number[]>();
  for (const { t, v } of stamps) {
    const iso = new Date(t).toISOString();
    const key = monthly ? iso.slice(0, 7) : iso.slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(v);
    else buckets.set(key, [v]);
  }
  return Array.from(buckets, ([date, values]) => ({ date, value: reduceValues(values, agg) })).sort(
    (a, b) => (a.date < b.date ? -1 : 1)
  );
}

/** Cross-tabulate two dimensions into a heatmap matrix. */
function buildMatrix(
  rows: Row[],
  rowCol: string,
  colCol: string,
  valueCol: string | null,
  agg: Aggregation
): MatrixSeries | null {
  const rowKeys = valueCounts(rows, rowCol).slice(0, HEATMAP_CAP).map((d) => d.name);
  const colKeys = valueCounts(rows, colCol).slice(0, HEATMAP_CAP).map((d) => d.name);
  if (rowKeys.length === 0 || colKeys.length === 0) return null;

  const rowSet = new Set(rowKeys);
  const colSet = new Set(colKeys);
  const buckets = new Map<string, number[]>();

  for (const row of rows) {
    const r = row[rowCol];
    const c = row[colCol];
    if (isBlank(r) || isBlank(c)) continue;
    const rk = String(r).trim();
    const ck = String(c).trim();
    if (!rowSet.has(rk) || !colSet.has(ck)) continue;

    let v = 1;
    if (valueCol !== null && agg !== "count") {
      const n = parseNumeric(row[valueCol]);
      if (n === null) continue;
      v = n;
    }
    const key = `${rk}\u0000${ck}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(v);
    else buckets.set(key, [v]);
  }

  const cells: { row: string; col: string; value: number }[] = [];
  for (const r of rowKeys) {
    for (const c of colKeys) {
      const values = buckets.get(`${r}\u0000${c}`);
      const useCount = valueCol === null || agg === "count";
      cells.push({
        row: r,
        col: c,
        value: values ? (useCount ? values.length : reduceValues(values, agg)) : 0,
      });
    }
  }

  const values = cells.map((c) => c.value);
  return {
    shape: "matrix",
    rows: rowKeys,
    cols: colKeys,
    cells,
    max: Math.max(...values),
    min: Math.min(...values),
  };
}
