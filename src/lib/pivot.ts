/* Pivot tables: the one tool every analyst reaches for first. Group rows by one
 * dimension, optionally cross them by a second, aggregate a measure, and total
 * both ways. Pure logic, no UI, so the arithmetic is unit-testable. */

import type { Row } from "./types";
import { parseNumeric } from "./number";
import type { Aggregation } from "./chart-recommend";

export interface PivotConfig {
  /** the dimension down the left */
  rowField: string;
  /** the dimension across the top; null builds a single-column summary */
  colField: string | null;
  /** the numeric column to aggregate; null counts rows */
  measure: string | null;
  agg: Aggregation;
  /** rows and columns beyond this many are folded into "Other" */
  limit?: number;
}

export interface PivotResult {
  rowKeys: string[];
  colKeys: string[];
  /** cells[rowIndex][colIndex]; null means the combination has no rows */
  cells: (number | null)[][];
  rowTotals: number[];
  colTotals: number[];
  grandTotal: number;
  /** the header shown above the value area, e.g. "Sum of revenue" */
  valueLabel: string;
}

const DEFAULT_LIMIT = 50;
const OTHER = "Other";
/** The single column used when no cross-tab dimension is chosen. */
export const TOTAL_COLUMN = "Total";

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function key(v: unknown): string {
  return String(v).trim();
}

/** Reduce a bucket of values. Totals re-aggregate from the underlying values
 *  rather than from the cells, so an average of averages never happens. */
function reduce(values: number[], agg: Aggregation, rowCount: number): number {
  if (agg === "count") return rowCount;
  if (values.length === 0) return 0;
  if (agg === "min") return Math.min(...values);
  if (agg === "max") return Math.max(...values);
  const sum = values.reduce((s, v) => s + v, 0);
  const result = agg === "avg" ? sum / values.length : sum;
  return Number.isInteger(result) ? result : parseFloat(result.toFixed(4));
}

/** Rank keys by weight so the biggest groups stay visible and the tail folds. */
function rankKeys(rows: Row[], field: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (isBlank(row[field])) continue;
    const k = key(row[field]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length <= limit) return sorted.map(([k]) => k).sort((a, b) => a.localeCompare(b));
  const head = sorted.slice(0, limit).map(([k]) => k).sort((a, b) => a.localeCompare(b));
  return [...head, OTHER];
}

export function buildPivot(rows: Row[], config: PivotConfig): PivotResult {
  const { rowField, colField, measure, agg } = config;
  const limit = config.limit ?? DEFAULT_LIMIT;

  const rowKeys = rankKeys(rows, rowField, limit);
  const colKeys = colField ? rankKeys(rows, colField, limit) : [TOTAL_COLUMN];
  const rowIndex = new Map(rowKeys.map((k, i) => [k, i]));
  const colIndex = new Map(colKeys.map((k, i) => [k, i]));

  // Buckets hold raw values so every total is computed from the source rows.
  const buckets = new Map<string, number[]>();
  const counts = new Map<string, number>();
  const rowBuckets = new Map<number, number[]>();
  const rowCounts = new Map<number, number>();
  const colBuckets = new Map<number, number[]>();
  const colCounts = new Map<number, number>();
  const all: number[] = [];
  let allCount = 0;

  const push = (map: Map<string | number, number[]>, k: string | number, v: number | null) => {
    if (v === null) return;
    const bucket = map.get(k);
    if (bucket) bucket.push(v);
    else map.set(k, [v]);
  };

  for (const row of rows) {
    if (isBlank(row[rowField])) continue;
    if (colField && isBlank(row[colField])) continue;

    const rk = rowIndex.has(key(row[rowField])) ? key(row[rowField]) : OTHER;
    const ri = rowIndex.get(rk);
    if (ri === undefined) continue;

    const ck = colField
      ? colIndex.has(key(row[colField]))
        ? key(row[colField])
        : OTHER
      : TOTAL_COLUMN;
    const ci = colIndex.get(ck);
    if (ci === undefined) continue;

    const value = measure === null ? null : parseNumeric(row[measure]);
    // A row whose measure is not numeric still counts, it just cannot be summed.
    if (measure !== null && value === null && agg !== "count") continue;

    const cellKey = `${ri}:${ci}`;
    push(buckets as Map<string | number, number[]>, cellKey, value);
    counts.set(cellKey, (counts.get(cellKey) ?? 0) + 1);
    push(rowBuckets as Map<string | number, number[]>, ri, value);
    rowCounts.set(ri, (rowCounts.get(ri) ?? 0) + 1);
    push(colBuckets as Map<string | number, number[]>, ci, value);
    colCounts.set(ci, (colCounts.get(ci) ?? 0) + 1);
    if (value !== null) all.push(value);
    allCount++;
  }

  const cells: (number | null)[][] = rowKeys.map((_, ri) =>
    colKeys.map((__, ci) => {
      const cellKey = `${ri}:${ci}`;
      const rowCount = counts.get(cellKey) ?? 0;
      if (rowCount === 0) return null;
      return reduce(buckets.get(cellKey) ?? [], agg, rowCount);
    })
  );

  return {
    rowKeys,
    colKeys,
    cells,
    rowTotals: rowKeys.map((_, ri) => reduce(rowBuckets.get(ri) ?? [], agg, rowCounts.get(ri) ?? 0)),
    colTotals: colKeys.map((_, ci) => reduce(colBuckets.get(ci) ?? [], agg, colCounts.get(ci) ?? 0)),
    grandTotal: reduce(all, agg, allCount),
    valueLabel: measure === null || agg === "count" ? "Count of rows" : `${aggLabel(agg)} of ${measure}`,
  };
}

function aggLabel(agg: Aggregation): string {
  if (agg === "avg") return "Average";
  if (agg === "sum") return "Sum";
  if (agg === "min") return "Min";
  if (agg === "max") return "Max";
  return "Count";
}

/** Flatten a pivot into CSV, totals included, so it can leave for Excel. */
export function pivotToCsv(result: PivotResult, rowField: string): string {
  const escape = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = [];
  lines.push([rowField, ...result.colKeys, "Total"].map(escape).join(","));
  result.rowKeys.forEach((rk, ri) => {
    lines.push([rk, ...result.cells[ri], result.rowTotals[ri]].map(escape).join(","));
  });
  lines.push(["Total", ...result.colTotals, result.grandTotal].map(escape).join(","));
  return lines.join("\n");
}
