/* Data analysis intelligence. Instead of stopping at "here is a number", every
 * detector answers four questions an analyst would be asked next: what happened,
 * why it may have happened, what it costs or is worth, and what to do about it.
 *
 * Pure logic over a profiled dataset, so each detector is unit-testable and the
 * dashboard, the report, and the AI prompt all read the same findings. */

import type { Dataset, Row, ColumnProfile } from "./types";
import { parseNumeric } from "./number";
import {
  numericColumns,
  dateColumns,
  categoricalColumns,
  bucketByDate,
  sumBy,
  valueCounts,
  pearson,
} from "./auto-dashboard";

export type FindingKind =
  | "trend"
  | "change"
  | "outlier"
  | "quality"
  | "correlation"
  | "target"
  | "performance"
  | "risk"
  | "opportunity";

export type Severity = "critical" | "warning" | "info" | "positive";

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  /** the headline an executive would read first */
  title: string;
  /** what happened, quantified */
  what: string;
  /** the most likely explanation the data itself supports */
  why?: string;
  /** what it means for the business */
  impact?: string;
  /** the concrete next action */
  recommendation?: string;
  /** columns this finding is about, so the UI can link the right chart */
  columns: string[];
  /** ranking weight, 0-100; the dashboard leads with the highest */
  score: number;
}

export interface Intelligence {
  findings: Finding[];
  /** one paragraph an executive can read on its own */
  summary: string;
  /** deduplicated actions, most important first */
  recommendations: string[];
}

/* ── formatting ── */

/** Compact number formatting shared by findings, KPIs, and the report. */
export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const pct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;

/* ── statistics ── */

interface Regression {
  slope: number;
  /** share of variance explained, 0-1; how much to trust the direction */
  r2: number;
}

/** Least-squares fit of y against its own position, which is what a trend line
 *  over evenly-spaced periods is. */
export function linearTrend(values: number[]): Regression {
  const n = values.length;
  if (n < 2) return { slope: 0, r2: 0 };

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    const dy = values[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { slope: 0, r2: 0 };

  const slope = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { slope, r2: r * r };
}

/** Percent change that stays honest when the baseline is zero or negative. */
function percentChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
}

/* ── shared context ── */

export interface Context {
  ds: Dataset;
  rows: Row[];
  measures: ColumnProfile[];
  dimensions: ColumnProfile[];
  dates: ColumnProfile[];
  /** the measure most worth talking about: complete, varied, not a target */
  primaryMeasure: ColumnProfile | null;
  primaryDate: ColumnProfile | null;
  primaryDimension: ColumnProfile | null;
}

const TARGET_RE = /target|goal|budget|quota|planned|forecast|benchmark|expected/i;

export function buildContext(ds: Dataset): Context {
  const measures = numericColumns(ds).sort(
    (a, b) => b.completeness - a.completeness || b.uniqueCount - a.uniqueCount
  );
  const dimensions = categoricalColumns(ds).sort((a, b) => a.uniqueCount - b.uniqueCount);
  const dates = dateColumns(ds).filter((d) => d.dateMin !== d.dateMax);

  return {
    ds,
    rows: ds.rows,
    measures,
    dimensions,
    dates,
    primaryMeasure: measures.find((m) => !TARGET_RE.test(m.name)) ?? measures[0] ?? null,
    primaryDate: dates[0] ?? null,
    // A two-value flag makes a poor headline segment ("true carries 64%"), so
    // prefer a dimension with enough values to actually compare.
    primaryDimension:
      dimensions.find((d) => d.uniqueCount >= 3 && d.uniqueCount <= 30) ?? dimensions[0] ?? null,
  };
}

/* ── detector: trends over time ── */

export function detectTrends(ctx: Context): Finding[] {
  const { primaryDate, measures, rows } = ctx;
  if (!primaryDate) return [];

  const out: Finding[] = [];
  for (const m of measures.slice(0, 3)) {
    const series = bucketByDate(rows, primaryDate.name, m.name);
    if (series.length < 3) continue;

    const values = series.map((s) => s.value);
    const { slope, r2 } = linearTrend(values);
    const first = values[0];
    const last = values[values.length - 1];
    const change = percentChange(first, last);
    if (change === null || Math.abs(change) < 10) continue;

    const rising = change > 0;
    const steady = r2 >= 0.5;
    const magnitude = Math.min(40, Math.abs(change) / 4);

    out.push({
      id: `trend_${m.name}`,
      kind: "trend",
      severity: rising ? "positive" : "warning",
      title: `${m.name} is ${rising ? "trending up" : "trending down"} ${pct(Math.abs(change), 0)}`,
      what: `${m.name} moved from ${formatNumber(first)} in ${series[0].date} to ${formatNumber(last)} in ${series[series.length - 1].date}, a ${pct(Math.abs(change), 1)} ${rising ? "increase" : "decrease"} across ${series.length} periods.`,
      why: steady
        ? `The movement is consistent rather than noisy (R² ${r2.toFixed(2)}), so it reflects a sustained shift of about ${formatNumber(slope)} per period rather than one unusual period.`
        : `The direction is clear but the period-to-period path is volatile (R² ${r2.toFixed(2)}), so the change is driven by a few periods rather than steady movement.`,
      impact: rising
        ? `If the current rate holds, ${m.name} adds roughly ${formatNumber(slope * 3)} over the next three periods.`
        : `If the current rate holds, ${m.name} loses roughly ${formatNumber(Math.abs(slope) * 3)} over the next three periods.`,
      recommendation: rising
        ? `Confirm what changed at the start of the run and fund it deliberately instead of assuming it continues.`
        : `Break ${m.name} down by ${ctx.primaryDimension?.name ?? "segment"} to find which part of the business is falling, then act on that part rather than the total.`,
      columns: [primaryDate.name, m.name],
      score: 70 + magnitude + (steady ? 8 : 0),
    });
  }
  return out;
}

/* ── detector: significant period-over-period moves ── */

export function detectChanges(ctx: Context): Finding[] {
  const { primaryDate, measures, rows } = ctx;
  if (!primaryDate) return [];

  const out: Finding[] = [];
  for (const m of measures.slice(0, 2)) {
    const series = bucketByDate(rows, primaryDate.name, m.name);
    if (series.length < 5) continue;

    const deltas: number[] = [];
    for (let i = 1; i < series.length; i++) {
      deltas.push(series[i].value - series[i - 1].value);
    }

    // A robust scale, because a single spike inflates the standard deviation
    // enough to hide itself. Median absolute deviation first, then the typical
    // move size, then the standard deviation as a last resort.
    const med = median(deltas);
    const mad = median(deltas.map((d) => Math.abs(d - med)));
    const scale = mad > 0 ? mad : median(deltas.map((d) => Math.abs(d))) || stdDev(deltas);
    if (scale === 0) continue;

    // The single most unusual period-over-period move.
    let worstIdx = 0;
    let worstRatio = 0;
    deltas.forEach((d, i) => {
      const ratio = Math.abs(d - med) / scale;
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstIdx = i;
      }
    });
    if (worstRatio < 3) continue;

    // A move that is immediately reversed is one unusual period, not two. Point
    // at the period that broke the pattern rather than the return to normal.
    if (worstIdx > 0) {
      const prev = deltas[worstIdx - 1];
      const curr = deltas[worstIdx];
      if (Math.sign(prev) === -Math.sign(curr) && Math.abs(prev) >= Math.abs(curr) * 0.6) {
        worstIdx -= 1;
        worstRatio = Math.abs(deltas[worstIdx] - med) / scale;
      }
    }

    const at = series[worstIdx + 1];
    const before = series[worstIdx];
    const delta = at.value - before.value;
    const change = percentChange(before.value, at.value);
    const spike = delta > 0;

    out.push({
      id: `change_${m.name}_${at.date}`,
      kind: "change",
      severity: spike ? "info" : "critical",
      title: `${spike ? "Spike" : "Drop"} in ${m.name} at ${at.date}`,
      what: `${m.name} ${spike ? "jumped" : "fell"} by ${formatNumber(Math.abs(delta))}${change === null ? "" : ` (${pct(Math.abs(change), 0)})`} between ${before.date} and ${at.date}, ${worstRatio.toFixed(1)} times the size of a typical period-over-period move.`,
      why: `Every other period moves by about ${formatNumber(Math.abs(med))}, so this period is an exception rather than the pattern. Check for a one-off event, a data load problem, or a change in how ${m.name} was recorded that period.`,
      impact: spike
        ? `Averages that include ${at.date} overstate the normal level of ${m.name}.`
        : `Averages that include ${at.date} understate the normal level of ${m.name}, and a repeat would cost about ${formatNumber(Math.abs(delta))}.`,
      recommendation: `Verify ${at.date} against the source system before quoting any average that spans it.`,
      columns: [primaryDate.name, m.name],
      score: 60 + Math.min(25, worstRatio * 4) + (spike ? 0 : 6),
    });
  }
  return out;
}

/* ── detector: outliers and anomalies ── */

export function detectOutliers(ctx: Context): Finding[] {
  const { measures, rows, primaryDimension } = ctx;
  const out: Finding[] = [];

  for (const m of measures.slice(0, 4)) {
    if (!m.outlierCount || m.outlierCount === 0) continue;
    if (m.p25 === undefined || m.p75 === undefined || m.iqr === undefined) continue;

    const lo = m.p25 - 1.5 * m.iqr;
    const hi = m.p75 + 1.5 * m.iqr;
    const share = (m.outlierCount / Math.max(1, rows.length)) * 100;

    // Where do the extreme rows concentrate? That is the root-cause hint.
    let concentration: { name: string; share: number } | null = null;
    if (primaryDimension) {
      const counts = new Map<string, number>();
      let total = 0;
      for (const row of rows) {
        const v = parseNumeric(row[m.name]);
        if (v === null || (v >= lo && v <= hi)) continue;
        const key = String(row[primaryDimension.name] ?? "").trim();
        if (key === "") continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total++;
      }
      const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
      if (top && total > 0 && top[1] / total >= 0.4) {
        concentration = { name: top[0], share: (top[1] / total) * 100 };
      }
    }

    out.push({
      id: `outlier_${m.name}`,
      kind: "outlier",
      severity: share >= 5 ? "warning" : "info",
      title: `${m.outlierCount} anomalous value${m.outlierCount === 1 ? "" : "s"} in ${m.name}`,
      what: `${m.outlierCount} of ${rows.length} rows (${pct(share, 1)}) fall outside the expected range ${formatNumber(lo)} to ${formatNumber(hi)}, set at 1.5 times the interquartile range. Values run from ${formatNumber(m.min ?? 0)} to ${formatNumber(m.max ?? 0)}.`,
      why: concentration
        ? `${pct(concentration.share, 0)} of them sit in ${primaryDimension!.name} = "${concentration.name}", which points at a specific segment rather than random noise.`
        : `They are spread across segments, which usually means data entry variance, mixed units, or genuinely rare events.`,
      impact: `The mean of ${m.name} (${formatNumber(m.mean ?? 0)}) is pulled away from the median (${formatNumber(m.median ?? 0)}), so any average quoted from this column is misleading.`,
      recommendation: concentration
        ? `Review the rows where ${primaryDimension!.name} is "${concentration.name}" first, then quote the median instead of the mean until they are resolved.`
        : `Quote the median instead of the mean, and confirm the extreme rows are real before removing them.`,
      columns: [m.name, ...(concentration && primaryDimension ? [primaryDimension.name] : [])],
      score: 45 + Math.min(25, share * 3),
    });
  }
  return out;
}

/* ── detector: missing and inconsistent data ── */

export function detectQuality(ctx: Context): Finding[] {
  const { ds, rows } = ctx;
  const out: Finding[] = [];

  const incomplete = ds.profiles
    .filter((p) => p.completeness < 100)
    .sort((a, b) => a.completeness - b.completeness);

  if (incomplete.length > 0) {
    const worst = incomplete[0];
    const missingShare = 100 - worst.completeness;
    out.push({
      id: "quality_missing",
      kind: "quality",
      severity: missingShare >= 20 ? "critical" : missingShare >= 5 ? "warning" : "info",
      title: `${worst.name} is missing ${pct(missingShare, 1)} of its values`,
      what: `${incomplete.length} column${incomplete.length === 1 ? " has" : "s have"} gaps. The worst is ${worst.name} with ${worst.missingCount} empty cells out of ${rows.length}${incomplete.length > 1 ? `, followed by ${incomplete.slice(1, 3).map((p) => `${p.name} (${p.missingCount})`).join(" and ")}` : ""}.`,
      why: `Gaps this shaped usually come from optional fields upstream, joins that did not match, or rows created before the field existed.`,
      impact: `Every average, group-by, and chart that touches ${worst.name} silently drops those rows, so totals will not reconcile with the source system.`,
      recommendation: `Fill ${worst.name} by ${worst.type === "number" ? "median" : "mode"} in Dataset Doctor, or exclude it from the analysis and say so in the report.`,
      columns: incomplete.slice(0, 3).map((p) => p.name),
      score: 50 + Math.min(30, missingShare),
    });
  }

  if (ds.duplicateRows > 0) {
    const share = (ds.duplicateRows / Math.max(1, rows.length)) * 100;
    out.push({
      id: "quality_duplicates",
      kind: "quality",
      severity: share >= 5 ? "critical" : "warning",
      title: `${ds.duplicateRows} duplicate row${ds.duplicateRows === 1 ? " inflates" : "s inflate"} every total`,
      what:
        ds.duplicateRows === 1
          ? `1 row (${pct(share, 1)}) is an exact copy of another row.`
          : `${ds.duplicateRows} rows (${pct(share, 1)}) are exact copies of another row.`,
      why: `Repeated exports, re-runs of an import, or an upstream join that fanned out are the usual causes.`,
      impact: `Counts and sums are overstated by up to ${pct(share, 1)} until they are removed.`,
      recommendation: `Remove duplicates in Dataset Doctor before quoting any total.`,
      columns: [],
      score: 55 + Math.min(25, share * 3),
    });
  }

  const invalid = ds.profiles.filter((p) => p.validity < 98);
  if (invalid.length > 0) {
    const worst = [...invalid].sort((a, b) => a.validity - b.validity)[0];
    out.push({
      id: "quality_validity",
      kind: "quality",
      severity: worst.validity < 90 ? "warning" : "info",
      title: `${worst.name} holds values that do not match its type`,
      what: `${pct(100 - worst.validity, 1)} of the filled cells in ${worst.name} do not parse as ${worst.type}.`,
      why: `Mixed formats in one column, usually text notes inside a numeric field or several date formats side by side.`,
      impact: `Those cells are skipped by aggregations, so ${worst.name} understates its true total.`,
      recommendation: `Standardize ${worst.name} to a single format, then re-profile the dataset.`,
      columns: [worst.name],
      score: 40 + (100 - worst.validity) / 2,
    });
  }

  // Formatting inconsistency the profiler already flagged as fixable.
  const formatting = ds.diagnostics.filter((d) =>
    /Casing|Whitespace|Encoding|Similar Values/i.test(d.title)
  );
  if (formatting.length > 0) {
    out.push({
      id: "quality_consistency",
      kind: "quality",
      severity: "warning",
      title: `${formatting.length} formatting inconsistenc${formatting.length === 1 ? "y" : "ies"} will split your group-bys`,
      what: formatting.map((d) => d.title).join("; ") + ".",
      why: `The same real-world value is stored more than one way, so a group-by treats "Lagos" and "lagos " as two segments.`,
      impact: `Category totals are split across variants, which understates the leaders and invents small segments that do not exist.`,
      recommendation: `Run Auto-fix all in Dataset Doctor, then re-check the category breakdown.`,
      columns: [],
      score: 48,
    });
  }

  return out;
}

/* ── detector: correlations ── */

export function detectCorrelations(ctx: Context): Finding[] {
  const { measures, rows } = ctx;
  const pool = measures.slice(0, 6);
  const out: Finding[] = [];

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i].name;
      const b = pool[j].name;
      const r = pearson(rows, a, b);
      if (r === null || Math.abs(r) < 0.5) continue;

      const together = r > 0;
      const strength = Math.abs(r) >= 0.8 ? "strong" : "moderate";
      out.push({
        id: `corr_${a}_${b}`,
        kind: "correlation",
        severity: "info",
        title: `${a} and ${b} move ${together ? "together" : "in opposite directions"} (r = ${r.toFixed(2)})`,
        what: `A ${strength} ${together ? "positive" : "negative"} correlation across ${rows.length} rows: ${Math.round(r * r * 100)}% of the variation in ${b} is matched by ${a}.`,
        why: `Either one drives the other, or a third factor drives both. The data alone cannot separate those, so treat this as a lead rather than a cause.`,
        impact: together
          ? `Moving ${a} is a plausible lever on ${b}, which makes it worth testing deliberately.`
          : `Gains in ${a} come with losses in ${b}, so optimizing one in isolation may cost you the other.`,
        recommendation: `Test the relationship on a subset before acting on it, and avoid using both columns as independent inputs in the same model.`,
        columns: [a, b],
        score: 35 + Math.abs(r) * 25,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/* ── detector: performance against targets ── */

export function detectTargets(ctx: Context): Finding[] {
  const { measures, rows, primaryDimension } = ctx;
  const targets = measures.filter((m) => TARGET_RE.test(m.name));
  if (targets.length === 0) return [];

  const out: Finding[] = [];
  for (const target of targets.slice(0, 2)) {
    const actual = findActualFor(target.name, measures);
    if (!actual) continue;

    const totalActual = sumColumn(rows, actual.name);
    const totalTarget = sumColumn(rows, target.name);
    if (totalTarget === 0) continue;

    const attainment = (totalActual / totalTarget) * 100;
    const gap = totalActual - totalTarget;
    const hit = attainment >= 100;

    // Which segments miss? That is where the action is.
    let laggards: { name: string; attainment: number }[] = [];
    if (primaryDimension) {
      const actualBy = new Map(sumBy(rows, primaryDimension.name, actual.name).map((d) => [d.name, d.value]));
      const targetBy = sumBy(rows, primaryDimension.name, target.name);
      laggards = targetBy
        .filter((t) => t.value > 0)
        .map((t) => ({ name: t.name, attainment: ((actualBy.get(t.name) ?? 0) / t.value) * 100 }))
        .sort((a, b) => a.attainment - b.attainment)
        .slice(0, 3);
    }

    const missing = laggards.filter((l) => l.attainment < 100);

    out.push({
      id: `target_${target.name}`,
      kind: "target",
      severity: attainment >= 100 ? "positive" : attainment >= 90 ? "warning" : "critical",
      title: `${actual.name} is at ${pct(attainment, 0)} of ${target.name}`,
      what: `${formatNumber(totalActual)} against a target of ${formatNumber(totalTarget)}, ${hit ? "ahead by" : "short by"} ${formatNumber(Math.abs(gap))}.`,
      why:
        missing.length > 0
          ? `The shortfall is concentrated: ${missing.map((l) => `${l.name} at ${pct(l.attainment, 0)}`).join(", ")}.`
          : hit
            ? `Attainment is spread across segments rather than carried by one.`
            : `No single segment explains the gap, so the shortfall is broad rather than local.`,
      impact: hit
        ? `The surplus of ${formatNumber(Math.abs(gap))} is headroom that can absorb a weaker next period.`
        : `Closing the gap requires ${formatNumber(Math.abs(gap))} of additional ${actual.name}.`,
      recommendation:
        missing.length > 0
          ? `Put the recovery effort into ${missing[0].name} first: it is furthest behind at ${pct(missing[0].attainment, 0)}.`
          : hit
            ? `Raise the target for the next period so it keeps pulling performance.`
            : `Re-forecast rather than re-plan: the target is missed broadly, which usually means it was set too high.`,
      columns: [actual.name, target.name, ...(primaryDimension ? [primaryDimension.name] : [])],
      score: hit ? 62 : 80 + Math.min(15, (100 - attainment) / 3),
    });
  }
  return out;
}

/** Pair a target column with the measure it is a target for: prefer the column
 *  whose name is the target's name minus the target word. */
function findActualFor(targetName: string, measures: ColumnProfile[]): ColumnProfile | null {
  const base = targetName
    .replace(TARGET_RE, "")
    .replace(/[_\s-]+/g, " ")
    .trim()
    .toLowerCase();

  const candidates = measures.filter((m) => m.name !== targetName && !TARGET_RE.test(m.name));
  if (candidates.length === 0) return null;

  if (base.length >= 3) {
    const exact = candidates.find((m) => m.name.toLowerCase().replace(/[_\s-]+/g, " ").trim() === base);
    if (exact) return exact;
    const partial = candidates.find((m) => m.name.toLowerCase().includes(base));
    if (partial) return partial;
  }
  return candidates[0];
}

function sumColumn(rows: Row[], column: string): number {
  let total = 0;
  for (const row of rows) {
    const n = parseNumeric(row[column]);
    if (n !== null) total += n;
  }
  return total;
}

/* ── detector: high and low performing categories ── */

export function detectPerformance(ctx: Context): Finding[] {
  const { primaryMeasure, dimensions, rows } = ctx;
  if (!primaryMeasure || dimensions.length === 0) return [];

  const dim = dimensions.find((d) => d.uniqueCount >= 3 && d.uniqueCount <= 30) ?? dimensions[0];
  const breakdown = sumBy(rows, dim.name, primaryMeasure.name);
  if (breakdown.length < 3) return [];

  const total = breakdown.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return [];

  const avg = total / breakdown.length;
  const top = breakdown[0];
  const bottom = breakdown[breakdown.length - 1];
  const counts = new Map(valueCounts(rows, dim.name).map((d) => [d.name, d.value]));

  const out: Finding[] = [];

  out.push({
    id: `perf_top_${dim.name}`,
    kind: "performance",
    severity: "positive",
    title: `${top.name} leads ${dim.name} with ${pct((top.value / total) * 100, 0)} of ${primaryMeasure.name}`,
    what: `${top.name} contributes ${formatNumber(top.value)} of ${formatNumber(total)} total ${primaryMeasure.name}, ${(top.value / avg).toFixed(1)}× the average segment (${formatNumber(avg)}) across ${counts.get(top.name) ?? 0} rows.`,
    why: `Either genuinely stronger performance, or more volume: it carries ${counts.get(top.name) ?? 0} of ${rows.length} rows, so check rate before crediting effectiveness.`,
    impact: `Whatever ${top.name} is doing is the single biggest contributor to ${primaryMeasure.name} today.`,
    recommendation: `Document what makes ${top.name} work and test it on the weakest segments before adding new ones.`,
    columns: [dim.name, primaryMeasure.name],
    score: 58 + Math.min(20, (top.value / total) * 40),
  });

  if (bottom.value < avg * 0.5) {
    const rowCount = counts.get(bottom.name) ?? 0;
    const gapToAvg = avg - bottom.value;
    out.push({
      id: `perf_bottom_${dim.name}`,
      kind: "performance",
      severity: "warning",
      title: `${bottom.name} is the weakest ${dim.name} at ${pct((bottom.value / total) * 100, 1)} of ${primaryMeasure.name}`,
      what: `${bottom.name} contributes ${formatNumber(bottom.value)}, ${pct((1 - bottom.value / avg) * 100, 0)} below the average segment, across ${rowCount} rows.`,
      why: rowCount < rows.length / breakdown.length / 2
        ? `It also has the fewest rows (${rowCount}), so the shortfall is at least partly volume rather than performance.`
        : `Its row count is normal, so the shortfall is per-row performance rather than volume.`,
      impact: `Bringing ${bottom.name} to the average segment would add about ${formatNumber(gapToAvg)} of ${primaryMeasure.name}.`,
      recommendation: `Decide explicitly whether to fix ${bottom.name} or stop investing in it: it is currently earning ${pct((bottom.value / total) * 100, 1)} of the total.`,
      columns: [dim.name, primaryMeasure.name],
      score: 56 + Math.min(18, ((avg - bottom.value) / avg) * 20),
    });
  }

  return out;
}

/* ── detector: risks ── */

export function detectRisks(ctx: Context): Finding[] {
  const { primaryMeasure, dimensions, rows, ds } = ctx;
  const out: Finding[] = [];

  // Concentration: one segment carrying the business is a single point of failure.
  if (primaryMeasure && dimensions.length > 0) {
    const dim = dimensions[0];
    const breakdown = sumBy(rows, dim.name, primaryMeasure.name);
    const total = breakdown.reduce((s, d) => s + d.value, 0);
    if (total > 0 && breakdown.length >= 3) {
      const share = (breakdown[0].value / total) * 100;
      if (share >= 40) {
        out.push({
          id: `risk_concentration_${dim.name}`,
          kind: "risk",
          severity: share >= 60 ? "critical" : "warning",
          title: `Concentration risk: ${breakdown[0].name} carries ${pct(share, 0)} of ${primaryMeasure.name}`,
          what: `One of ${breakdown.length} ${dim.name} values accounts for ${pct(share, 1)} of all ${primaryMeasure.name}.`,
          why: `Growth has come from one segment faster than the others have kept up.`,
          impact: `A ${pct(20, 0)} decline in ${breakdown[0].name} alone would cost about ${formatNumber(breakdown[0].value * 0.2)} of ${primaryMeasure.name}, and no other segment is large enough to absorb it.`,
          recommendation: `Set a concentration ceiling and grow the second and third ${dim.name} deliberately until the top share is under 40%.`,
          columns: [dim.name, primaryMeasure.name],
          score: 66 + Math.min(20, (share - 40) / 2),
        });
      }
    }
  }

  // Sample size: small datasets cannot support the conclusions people draw.
  if (rows.length > 0 && rows.length < 30) {
    out.push({
      id: "risk_sample",
      kind: "risk",
      severity: "warning",
      title: `Only ${rows.length} rows: too few for confident conclusions`,
      what: `The dataset has ${rows.length} rows across ${ds.columns.length} columns.`,
      why: `Below roughly 30 observations, one unusual row moves every average materially.`,
      impact: `Segment comparisons and trends here are directional at best and should not be quoted as findings.`,
      recommendation: `Extend the export window or combine periods before drawing conclusions from segment splits.`,
      columns: [],
      score: 64,
    });
  }

  // Truncated imports mean every total is wrong, which outranks most findings.
  if (ds.truncated) {
    out.push({
      id: "risk_truncated",
      kind: "risk",
      severity: "critical",
      title: `The import stopped early, so totals are incomplete`,
      what: `Parsing hit the row cap at ${rows.length} rows, so this analysis covers only part of the source file.`,
      why: `The file is larger than the in-browser row limit.`,
      impact: `Every sum, count, and share in this report understates reality by an unknown amount.`,
      recommendation: `Split the source file or load it through SQL Lab before publishing any total from it.`,
      columns: [],
      score: 95,
    });
  }

  return out;
}

/* ── detector: opportunities ── */

export function detectOpportunities(ctx: Context): Finding[] {
  const { primaryMeasure, primaryDate, dimensions, rows } = ctx;
  if (!primaryMeasure) return [];

  const out: Finding[] = [];

  // The fastest-growing segment: where to put the next unit of effort.
  if (primaryDate && dimensions.length > 0) {
    const dim = dimensions[0];
    const segments = valueCounts(rows, dim.name).slice(0, 8);
    const growth: { name: string; change: number; latest: number }[] = [];

    for (const seg of segments) {
      const segRows = rows.filter((r) => String(r[dim.name] ?? "").trim() === seg.name);
      const series = bucketByDate(segRows, primaryDate.name, primaryMeasure.name);
      if (series.length < 3) continue;
      const change = percentChange(series[0].value, series[series.length - 1].value);
      if (change === null) continue;
      growth.push({ name: seg.name, change, latest: series[series.length - 1].value });
    }

    if (growth.length >= 2) {
      const best = growth.sort((a, b) => b.change - a.change)[0];
      if (best.change >= 15) {
        out.push({
          id: `opp_growth_${dim.name}`,
          kind: "opportunity",
          severity: "positive",
          title: `${best.name} is growing fastest at ${pct(best.change, 0)}`,
          what: `Across ${growth.length} ${dim.name} segments measured over the same periods, ${best.name} grew ${pct(best.change, 1)} in ${primaryMeasure.name} while the median segment moved ${pct(median(growth.map((g) => g.change)), 1)}.`,
          why: `Growth this far above the rest usually means the segment is early in its curve rather than mature.`,
          impact: `Holding this rate, ${best.name} contributes roughly ${formatNumber(best.latest * (1 + best.change / 100))} next period.`,
          recommendation: `Shift the next increment of budget toward ${best.name} and measure whether the rate holds for two more periods before committing further.`,
          columns: [dim.name, primaryMeasure.name, primaryDate.name],
          score: 60 + Math.min(20, best.change / 5),
        });
      }
    }
  }

  // High-volume, low-yield segments: the biggest fixable gap.
  if (dimensions.length > 0) {
    const dim = dimensions[0];
    const counts = valueCounts(rows, dim.name);
    const sums = new Map(sumBy(rows, dim.name, primaryMeasure.name).map((d) => [d.name, d.value]));
    const perRow = counts
      .filter((c) => c.value >= 5)
      .map((c) => ({ name: c.name, rows: c.value, perRow: (sums.get(c.name) ?? 0) / c.value }))
      .sort((a, b) => b.perRow - a.perRow);

    if (perRow.length >= 3) {
      const best = perRow[0];
      const worst = perRow[perRow.length - 1];
      if (best.perRow > 0 && worst.perRow < best.perRow * 0.6) {
        const upside = (best.perRow - worst.perRow) * worst.rows;
        out.push({
          id: `opp_yield_${dim.name}`,
          kind: "opportunity",
          severity: "info",
          title: `${worst.name} earns ${formatNumber(worst.perRow)} per row against ${formatNumber(best.perRow)} for ${best.name}`,
          what: `Per-row ${primaryMeasure.name} varies ${(best.perRow / Math.max(worst.perRow, 0.0001)).toFixed(1)}× across ${dim.name}, with ${worst.name} lowest over ${worst.rows} rows.`,
          why: `Same volume, different yield, which points at pricing, mix, or execution rather than demand.`,
          impact: `Lifting ${worst.name} to the top per-row rate would add about ${formatNumber(upside)} of ${primaryMeasure.name} with no extra volume.`,
          recommendation: `Compare how ${best.name} and ${worst.name} are handled before spending anything on new volume.`,
          columns: [dim.name, primaryMeasure.name],
          score: 54,
        });
      }
    }
  }

  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* ── the engine ── */

const MAX_FINDINGS = 24;

/** Run every detector and rank what came back. */
export function analyze(ds: Dataset): Intelligence {
  if (ds.rows.length === 0) {
    return {
      findings: [],
      summary: `${ds.name} has no rows to analyze.`,
      recommendations: [],
    };
  }

  const ctx = buildContext(ds);
  const findings = [
    ...detectRisks(ctx),
    ...detectTargets(ctx),
    ...detectTrends(ctx),
    ...detectChanges(ctx),
    ...detectQuality(ctx),
    ...detectPerformance(ctx),
    ...detectOutliers(ctx),
    ...detectOpportunities(ctx),
    ...detectCorrelations(ctx),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FINDINGS);

  return {
    findings,
    summary: buildSummary(ds, ctx, findings),
    recommendations: collectRecommendations(findings),
  };
}

/* A dataset object is replaced whenever its rows change, so identity is a safe
 * cache key. Without this the dashboard analyzes the same rows twice: once for
 * the findings panel and once for the report. */
const analysisCache = new WeakMap<Dataset, Intelligence>();

export function analyzeCached(ds: Dataset): Intelligence {
  const hit = analysisCache.get(ds);
  if (hit) return hit;
  const result = analyze(ds);
  analysisCache.set(ds, result);
  return result;
}

/** The executive summary: what the dataset is, then the three things that
 *  matter most, in the order an analyst would say them out loud. */
export function buildSummary(ds: Dataset, ctx: Context, findings: Finding[]): string {
  const shape = `${ds.name} holds ${formatNumber(ds.rows.length)} rows across ${ds.columns.length} columns${
    ctx.primaryDate?.dateMin ? `, covering ${ctx.primaryDate.dateMin} to ${ctx.primaryDate.dateMax}` : ""
  }.`;

  const quality = `Data health is ${ds.health.overall}% (completeness ${ds.health.completeness}%, validity ${ds.health.validity}%, consistency ${ds.health.consistency}%)${
    ds.diagnostics.length > 0 ? `, with ${ds.diagnostics.length} issue${ds.diagnostics.length === 1 ? "" : "s"} still open` : " with no open issues"
  }.`;

  const headline = findings.filter((f) => f.severity === "critical" || f.severity === "warning").slice(0, 2);
  const good = findings.find((f) => f.severity === "positive");

  const parts = [shape, quality];

  // Titles keep their capitalisation: they start with real values like "Pro"
  // and "North", which must not be lowercased to fit a sentence.
  if (headline.length > 0) {
    parts.push(`Needs attention: ${headline.map((f) => f.title).join("; ")}.`);
  }
  if (good) {
    parts.push(`On the positive side: ${good.title}.`);
  }
  if (headline.length === 0 && !good) {
    parts.push(`No material trends, anomalies, or quality problems surfaced, so the dataset can be used as it stands.`);
  }

  return parts.join(" ");
}

function collectRecommendations(findings: Finding[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of findings) {
    if (!f.recommendation || seen.has(f.recommendation)) continue;
    seen.add(f.recommendation);
    out.push(f.recommendation);
  }
  return out.slice(0, 8);
}
