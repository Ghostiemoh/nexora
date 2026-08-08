/* Period-over-period comparison: what changed between last month's export and
 * this month's.
 *
 * Replaying a recipe gets the new file clean. It does not answer the question
 * the analyst is actually being paid to answer, which is what moved. This reads
 * two profiled datasets and reports the movement that matters: schema drift
 * first, because drift invalidates every other comparison on the page, then
 * totals, then the columns that arrived emptier, then the categories that came
 * and went. */

import type { ColumnProfile, ColumnType, Dataset, Row } from "./types";
import { formatNumber } from "./insights";
import { normalizeColumnName } from "./fingerprint";
import { parseNumeric } from "./number";

/** Above this many distinct values a column is an identifier, not a category,
 *  and listing what appeared would be noise rather than a finding. */
export const CATEGORY_COMPARE_CAP = 200;

/** Completeness has to move by more than this many percentage points before it
 *  is worth the reader's attention. Small files jitter. */
const COMPLETENESS_NOISE_FLOOR = 2;

export interface NumericDelta {
  column: string;
  previousTotal: number;
  currentTotal: number;
  /** percent change in the total, null when the previous total was zero */
  totalChangePct: number | null;
  previousMean: number;
  currentMean: number;
  meanChangePct: number | null;
}

export interface CompletenessDelta {
  column: string;
  previousCompleteness: number;
  currentCompleteness: number;
  /** percentage points, current minus previous */
  delta: number;
}

export interface CategoryDelta {
  column: string;
  appeared: string[];
  disappeared: string[];
}

export interface PeriodDiff {
  previousName: string;
  currentName: string;
  rowsBefore: number;
  rowsAfter: number;
  /** null when the previous file had no rows to compare against */
  rowChangePct: number | null;
  healthBefore: number;
  healthAfter: number;
  addedColumns: string[];
  removedColumns: string[];
  retypedColumns: { column: string; from: ColumnType; to: ColumnType }[];
  /** true when any column appeared, disappeared, or changed type */
  schemaChanged: boolean;
  numericDeltas: NumericDelta[];
  completenessDeltas: CompletenessDelta[];
  categoryDeltas: CategoryDelta[];
  /** plain sentences, most material first */
  narrative: string[];
}

function percentChange(before: number, after: number): number | null {
  if (before === 0) return null;
  return ((after - before) / Math.abs(before)) * 100;
}

function signed(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** Distinct values of a column, or null when there are too many to be a
 *  category worth enumerating. */
function distinctValues(rows: Row[], column: string): Set<string> | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined || value === "") continue;
    seen.add(String(value));
    if (seen.size > CATEGORY_COMPARE_CAP) return null;
  }
  return seen;
}

function totalAndMean(rows: Row[], column: string): { total: number; mean: number } {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const value = parseNumeric(row[column]);
    if (value === null) continue;
    total += value;
    count++;
  }
  return { total, mean: count === 0 ? 0 : total / count };
}

export function diffPeriods(previous: Dataset, current: Dataset): PeriodDiff {
  const prevByKey = new Map<string, ColumnProfile>();
  for (const profile of previous.profiles) {
    prevByKey.set(normalizeColumnName(profile.name), profile);
  }
  const currByKey = new Map<string, ColumnProfile>();
  for (const profile of current.profiles) {
    currByKey.set(normalizeColumnName(profile.name), profile);
  }

  const addedColumns: string[] = [];
  const retypedColumns: PeriodDiff["retypedColumns"] = [];
  const numericDeltas: NumericDelta[] = [];
  const completenessDeltas: CompletenessDelta[] = [];
  const categoryDeltas: CategoryDelta[] = [];

  for (const [key, currProfile] of currByKey) {
    const prevProfile = prevByKey.get(key);
    if (!prevProfile) {
      addedColumns.push(currProfile.name);
      continue;
    }

    if (prevProfile.type !== currProfile.type) {
      retypedColumns.push({
        column: currProfile.name,
        from: prevProfile.type,
        to: currProfile.type,
      });
    }

    const completenessDelta = currProfile.completeness - prevProfile.completeness;
    if (Math.abs(completenessDelta) > COMPLETENESS_NOISE_FLOOR) {
      completenessDeltas.push({
        column: currProfile.name,
        previousCompleteness: prevProfile.completeness,
        currentCompleteness: currProfile.completeness,
        delta: completenessDelta,
      });
    }

    /* Totals are only comparable while both sides are still numbers. A column
     * that arrived as text this month is reported as drift instead, which is
     * the honest answer: there is no total to compare. */
    if (prevProfile.type === "number" && currProfile.type === "number") {
      const before = totalAndMean(previous.rows, prevProfile.name);
      const after = totalAndMean(current.rows, currProfile.name);
      numericDeltas.push({
        column: currProfile.name,
        previousTotal: before.total,
        currentTotal: after.total,
        totalChangePct: percentChange(before.total, after.total),
        previousMean: before.mean,
        currentMean: after.mean,
        meanChangePct: percentChange(before.mean, after.mean),
      });
    }

    if (currProfile.type === "category" || currProfile.type === "string") {
      const beforeValues = distinctValues(previous.rows, prevProfile.name);
      const afterValues = distinctValues(current.rows, currProfile.name);
      if (beforeValues && afterValues) {
        const appeared = [...afterValues].filter((v) => !beforeValues.has(v));
        const disappeared = [...beforeValues].filter((v) => !afterValues.has(v));
        if (appeared.length > 0 || disappeared.length > 0) {
          categoryDeltas.push({ column: currProfile.name, appeared, disappeared });
        }
      }
    }
  }

  const removedColumns = previous.profiles
    .filter((p) => !currByKey.has(normalizeColumnName(p.name)))
    .map((p) => p.name);

  // Biggest movement first within each section.
  numericDeltas.sort(
    (a, b) => Math.abs(b.totalChangePct ?? 0) - Math.abs(a.totalChangePct ?? 0)
  );
  completenessDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const diff: PeriodDiff = {
    previousName: previous.name,
    currentName: current.name,
    rowsBefore: previous.rows.length,
    rowsAfter: current.rows.length,
    rowChangePct: percentChange(previous.rows.length, current.rows.length),
    healthBefore: previous.health.overall,
    healthAfter: current.health.overall,
    addedColumns,
    removedColumns,
    retypedColumns,
    schemaChanged:
      addedColumns.length > 0 || removedColumns.length > 0 || retypedColumns.length > 0,
    numericDeltas,
    completenessDeltas,
    categoryDeltas,
    narrative: [],
  };

  diff.narrative = writeNarrative(diff);
  return diff;
}

/** Turn the measurements into sentences, ordered so the reader hits the thing
 *  that invalidates the rest of the page before the things it invalidates. */
function writeNarrative(diff: PeriodDiff): string[] {
  const lines: string[] = [];

  for (const { column, from, to } of diff.retypedColumns) {
    lines.push(
      `'${column}' changed type from ${from} to ${to}. Totals on that column are not comparable with ${diff.previousName} until it is converted back.`
    );
  }
  if (diff.removedColumns.length > 0) {
    lines.push(
      `${diff.removedColumns.length === 1 ? "A column stopped" : "Columns stopped"} arriving: ${diff.removedColumns.join(", ")}.`
    );
  }
  if (diff.addedColumns.length > 0) {
    lines.push(`New in this file: ${diff.addedColumns.join(", ")}.`);
  }

  if (diff.rowsAfter !== diff.rowsBefore) {
    const delta = diff.rowsAfter - diff.rowsBefore;
    const magnitude = diff.rowChangePct === null ? "" : ` (${signed(diff.rowChangePct)})`;
    lines.push(
      `Row count went from ${formatNumber(diff.rowsBefore)} to ${formatNumber(diff.rowsAfter)}, ${delta > 0 ? "up" : "down"} ${formatNumber(Math.abs(delta))}${magnitude}.`
    );
  }

  for (const d of diff.numericDeltas) {
    if (d.totalChangePct === null || Math.abs(d.totalChangePct) < 0.05) continue;
    const meanNote =
      d.meanChangePct !== null && Math.abs(d.meanChangePct) < 0.05
        ? " The average per row is unchanged, so the move is row count rather than size."
        : "";
    lines.push(
      `'${d.column}' totals ${formatNumber(d.currentTotal)} against ${formatNumber(d.previousTotal)} last period, ${signed(d.totalChangePct)}.${meanNote}`
    );
  }

  for (const d of diff.completenessDeltas) {
    lines.push(
      d.delta < 0
        ? `'${d.column}' arrived emptier: ${d.currentCompleteness.toFixed(1)}% filled against ${d.previousCompleteness.toFixed(1)}% last period.`
        : `'${d.column}' arrived more complete: ${d.currentCompleteness.toFixed(1)}% filled against ${d.previousCompleteness.toFixed(1)}% last period.`
    );
  }

  for (const d of diff.categoryDeltas) {
    if (d.appeared.length > 0) {
      lines.push(`'${d.column}' has ${d.appeared.length} new value(s): ${d.appeared.join(", ")}.`);
    }
    if (d.disappeared.length > 0) {
      lines.push(`'${d.column}' no longer contains: ${d.disappeared.join(", ")}.`);
    }
  }

  if (diff.healthAfter !== diff.healthBefore) {
    const delta = diff.healthAfter - diff.healthBefore;
    lines.push(
      `Data health ${delta > 0 ? "improved" : "fell"} from ${diff.healthBefore}% to ${diff.healthAfter}%.`
    );
  }

  if (lines.length === 0) {
    return ["Nothing of substance changed between the two files."];
  }
  return lines;
}
