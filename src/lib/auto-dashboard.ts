/* Auto-dashboard engine: inspects a profiled dataset and decides every chart
 * it can meaningfully support: KPI cards, pies, bars, histograms, time series,
 * and pivot-style breakdowns, plus plain-language insights. Pure logic, no UI,
 * so chart selection is unit-testable. */

import type { Dataset, ColumnProfile, Row } from "./types";
import { parseNumeric, isIdentifierName, isSequentialIndex } from "./number";
import { parseStrictDate } from "./profile";
import { isExcelDateSerial } from "./clean";

export interface KpiSpec {
  id: string;
  label: string;
  value: number;
  /** how the renderer should format the value */
  format: "integer" | "number" | "percent";
  sub?: string;
}

export interface PieSpec {
  kind: "pie";
  id: string;
  title: string;
  /** clicking a slice cross-filters the dashboard on this column */
  filterColumn?: string;
  data: { name: string; value: number }[];
}

export interface BarSpec {
  kind: "bar";
  id: string;
  title: string;
  /** label under the value axis, e.g. "rows" or "Sum of Amount" */
  valueLabel: string;
  /** clicking a bar cross-filters the dashboard on this column */
  filterColumn?: string;
  data: { name: string; value: number }[];
}

export interface HistogramSpec {
  kind: "histogram";
  id: string;
  title: string;
  data: { bin: string; count: number }[];
  mean?: number;
  median?: number;
}

export interface LineSpec {
  kind: "line";
  id: string;
  title: string;
  valueLabel: string;
  data: { date: string; value: number }[];
}

export type ChartSpec = PieSpec | BarSpec | HistogramSpec | LineSpec;

export interface DashboardSpec {
  kpis: KpiSpec[];
  charts: ChartSpec[];
  insights: string[];
}

const MAX_CHARTS = 12;
const PIE_MAX_SLICES = 7;

/* ── column classification ── */

function nonNullCount(p: ColumnProfile, rowCount: number): number {
  return rowCount - p.missingCount;
}

function numericColumns(ds: Dataset): ColumnProfile[] {
  return ds.profiles.filter((p) => {
    if (p.type !== "number" || isIdentifierName(p.name)) return false;
    // Row indexes in disguise (0..n serials) are not measures: summing or
    // pivoting them produces meaningless totals.
    const values = ds.rows
      .map((r) => parseNumeric(r[p.name]))
      .filter((n): n is number => n !== null);
    return !isSequentialIndex(values);
  });
}

function dateColumns(ds: Dataset): ColumnProfile[] {
  return ds.profiles.filter((p) => p.type === "date");
}

/** Category-like columns: profiled categories/booleans, plus low-cardinality
 *  strings the profiler left as plain text (still pivotable, Excel-style). */
function categoricalColumns(ds: Dataset): ColumnProfile[] {
  const rowCount = ds.rows.length;
  return ds.profiles.filter((p) => {
    if (p.type === "category" || p.type === "boolean") return p.uniqueCount >= 2;
    if (p.type !== "string" || isIdentifierName(p.name)) return false;
    const nn = nonNullCount(p, rowCount);
    return p.uniqueCount >= 2 && p.uniqueCount <= 25 && nn > 0 && p.uniqueCount <= nn * 0.5;
  });
}

/* ── shared aggregation helpers ── */

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Count rows per trimmed value of a column, descending. */
export function valueCounts(rows: Row[], column: string): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = row[column];
    if (isBlank(v)) continue;
    const key = String(v).trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** SUM(valueCol) grouped by catCol, descending. */
export function sumBy(rows: Row[], catCol: string, valueCol: string): { name: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const cat = row[catCol];
    if (isBlank(cat)) continue;
    const n = parseNumeric(row[valueCol]);
    if (n === null) continue;
    const key = String(cat).trim();
    sums.set(key, (sums.get(key) ?? 0) + n);
  }
  return Array.from(sums, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Keep the top N entries and fold the remainder into "Other". */
export function topWithOther(data: { name: string; value: number }[], top: number): { name: string; value: number }[] {
  if (data.length <= top) return data;
  const head = data.slice(0, top);
  const rest = data.slice(top).reduce((acc, d) => acc + d.value, 0);
  return [...head, { name: "Other", value: rest }];
}

/** Equal-width histogram over a numeric column (default 10 bins). */
export function binNumeric(rows: Row[], column: string, binCount = 10): { bin: string; count: number }[] {
  const values: number[] = [];
  for (const row of rows) {
    const n = parseNumeric(row[column]);
    if (n !== null) values.push(n);
  }
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ bin: fmtShort(min), count: values.length }];

  const bins = Math.min(binCount, Math.max(3, values.length));
  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[idx]++;
  }
  return counts.map((count, i) => ({
    bin: `${fmtShort(min + i * width)}–${fmtShort(min + (i + 1) * width)}`,
    count,
  }));
}

/** Bucket rows by a date column (day or month depending on span) and sum a
 *  numeric column, or count rows when valueCol is null. */
export function bucketByDate(
  rows: Row[],
  dateCol: string,
  valueCol: string | null
): { date: string; value: number }[] {
  const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
  const stamps: { t: number; v: number }[] = [];
  for (const row of rows) {
    let t = parseStrictDate(row[dateCol]);
    if (t === null) {
      // Date-typed columns may still hold raw Excel serials (44391 = 2021-07-14).
      const n = parseNumeric(row[dateCol]);
      if (n !== null && isExcelDateSerial(n)) t = EXCEL_EPOCH_MS + n * 86_400_000;
    }
    if (t === null) continue;
    const v = valueCol === null ? 1 : parseNumeric(row[valueCol]);
    if (v === null) continue;
    stamps.push({ t, v });
  }
  if (stamps.length === 0) return [];

  const times = stamps.map((s) => s.t);
  const spanDays = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  const monthly = spanDays > 92;

  const buckets = new Map<string, number>();
  for (const { t, v } of stamps) {
    const iso = new Date(t).toISOString();
    const key = monthly ? iso.slice(0, 7) : iso.slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + v);
  }
  return Array.from(buckets, ([date, value]) => ({ date, value })).sort((a, b) =>
    a.date < b.date ? -1 : 1
  );
}

/** Pearson correlation across rows where both columns are numeric. */
export function pearson(rows: Row[], colA: string, colB: string): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const row of rows) {
    const a = parseNumeric(row[colA]);
    const b = parseNumeric(row[colB]);
    if (a !== null && b !== null) {
      xs.push(a);
      ys.push(b);
    }
  }
  const n = xs.length;
  if (n < 10) return null;

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(abs < 10 ? 2 : 1);
}

/* ── the engine ── */

/** Build the dashboard spec. Pass `rowsOverride` to build against a filtered
 *  subset (cross-filtering) while keeping column typing from the full profile. */
export function buildDashboard(ds: Dataset, rowsOverride?: Row[]): DashboardSpec {
  const rows = rowsOverride ?? ds.rows;
  const rowCount = rows.length;
  const numerics = numericColumns(ds);
  const dates = dateColumns(ds);
  const cats = categoricalColumns(ds);

  // Rank measures by completeness then spread so the most usable numeric
  // columns drive KPIs, pivots, and trends.
  const measures = [...numerics].sort(
    (a, b) => b.completeness - a.completeness || (b.uniqueCount - a.uniqueCount)
  );

  /* KPI row */
  const kpis: KpiSpec[] = [
    { id: "kpi_rows", label: "Rows", value: rowCount, format: "integer" },
    { id: "kpi_cols", label: "Columns", value: ds.columns.length, format: "integer" },
  ];
  for (const m of measures.slice(0, 2)) {
    const values = rows.map((r) => parseNumeric(r[m.name])).filter((n): n is number => n !== null);
    const sum = values.reduce((s, v) => s + v, 0);
    kpis.push({
      id: `kpi_sum_${m.name}`,
      label: `Total ${m.name}`,
      value: sum,
      format: "number",
      sub: `avg ${fmtShort(m.mean ?? (values.length ? sum / values.length : 0))} · median ${fmtShort(m.median ?? 0)}`,
    });
  }
  if (cats.length > 0 && kpis.length < 6) {
    kpis.push({
      id: `kpi_distinct_${cats[0].name}`,
      label: `Distinct ${cats[0].name}`,
      value: cats[0].uniqueCount,
      format: "integer",
    });
  }
  if (kpis.length < 6) {
    kpis.push({
      id: "kpi_health",
      label: "Health score",
      value: ds.health.overall,
      format: "percent",
    });
  }

  /* Charts, in priority order */
  const charts: ChartSpec[] = [];
  const insights: string[] = [];

  // 1. Time series: first date column that actually varies × up to 2 measures
  // (or row counts). Constant columns ("last updated" stamps) are skipped.
  for (const dc of dates) {
    let added = 0;
    const seriesMeasures = measures.slice(0, 2);
    if (seriesMeasures.length === 0) {
      const data = bucketByDate(rows, dc.name, null);
      if (data.length >= 2) {
        charts.push({ kind: "line", id: `line_count_${dc.name}`, title: `Records over time (${dc.name})`, valueLabel: "rows", data });
        added++;
      }
    } else {
      for (const m of seriesMeasures) {
        const data = bucketByDate(rows, dc.name, m.name);
        if (data.length >= 2) {
          charts.push({ kind: "line", id: `line_${m.name}_${dc.name}`, title: `${m.name} over time`, valueLabel: `Sum of ${m.name}`, data });
          added++;
        }
      }
    }
    if (added > 0) {
      if (dc.dateMin && dc.dateMax) {
        insights.push(`Data covers ${dc.dateMin} → ${dc.dateMax} (${dc.name}).`);
      }
      // Period-over-period movement on the first series.
      const first = charts.find((c): c is LineSpec => c.kind === "line");
      if (first && first.data.length >= 3) {
        const prev = first.data[first.data.length - 2].value;
        const last = first.data[first.data.length - 1].value;
        if (prev !== 0) {
          const pct = ((last - prev) / Math.abs(prev)) * 100;
          if (Math.abs(pct) >= 10) {
            insights.push(
              `${first.valueLabel} ${pct > 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(0)}% in the latest period (${first.data[first.data.length - 1].date}).`
            );
          }
        }
      }
      break;
    }
  }

  // 2. Pivot breakdowns: Excel-style SUM(measure) by category.
  const pivotCat = cats.find((c) => c.uniqueCount <= 12) ?? cats[0];
  if (pivotCat) {
    for (const m of measures.slice(0, 2)) {
      const data = topWithOther(sumBy(rows, pivotCat.name, m.name), 8);
      if (data.length >= 2) {
        charts.push({
          kind: "bar",
          id: `pivot_${m.name}_${pivotCat.name}`,
          title: `${m.name} by ${pivotCat.name}`,
          valueLabel: `Sum of ${m.name}`,
          filterColumn: pivotCat.name,
          data,
        });
        const total = data.reduce((s, d) => s + d.value, 0);
        const top = data[0];
        if (total > 0 && top.name !== "Other" && top.value / total >= 0.3) {
          insights.push(
            `'${top.name}' drives ${((top.value / total) * 100).toFixed(0)}% of total ${m.name}.`
          );
        }
        // Pareto concentration: how few categories carry 80% of the value.
        if (total > 0 && data.length >= 4) {
          let cum = 0;
          let k = 0;
          for (const d of data) {
            cum += d.value;
            k++;
            if (cum / total >= 0.8) break;
          }
          if (k <= Math.ceil(data.length / 2)) {
            insights.push(
              `Pareto: top ${k} of ${data.length} ${pivotCat.name} value(s) carry ${((cum / total) * 100).toFixed(0)}% of ${m.name}.`
            );
          }
        }
      }
    }
  }

  // 3. Pies: low-cardinality categoricals as composition.
  for (const c of cats.filter((c) => c.uniqueCount <= PIE_MAX_SLICES).slice(0, 3)) {
    const data = topWithOther(valueCounts(rows, c.name), PIE_MAX_SLICES);
    if (data.length >= 2) {
      charts.push({ kind: "pie", id: `pie_${c.name}`, title: `${c.name} split`, filterColumn: c.name, data });
      const total = data.reduce((s, d) => s + d.value, 0);
      if (total > 0 && data[0].value / total >= 0.5) {
        insights.push(
          `'${data[0].name}' accounts for ${((data[0].value / total) * 100).toFixed(0)}% of ${c.name}.`
        );
      }
    }
  }

  // 4. Histograms: every numeric column's distribution.
  for (const m of measures.slice(0, 4)) {
    const data = binNumeric(rows, m.name);
    if (data.length >= 2) {
      charts.push({
        kind: "histogram",
        id: `hist_${m.name}`,
        title: `${m.name} distribution`,
        data,
        mean: m.mean,
        median: m.median,
      });
    }
    if (m.outlierCount && m.outlierCount > 0) {
      insights.push(`${m.name} has ${m.outlierCount} outlier(s) beyond the 1.5×IQR fence.`);
    }
    if (m.mean !== undefined && m.median !== undefined && m.median !== 0) {
      const skew = (m.mean - m.median) / Math.abs(m.median);
      if (Math.abs(skew) >= 0.25) {
        insights.push(
          `${m.name} is ${skew > 0 ? "right" : "left"}-skewed (mean ${fmtShort(m.mean)} vs median ${fmtShort(m.median)}), so quote the median instead.`
        );
      }
    }
  }

  // 5. Top-N bars: higher-cardinality categoricals by frequency.
  for (const c of cats.filter((c) => c.uniqueCount > PIE_MAX_SLICES).slice(0, 2)) {
    const data = valueCounts(rows, c.name).slice(0, 10);
    if (data.length >= 2) {
      charts.push({ kind: "bar", id: `bar_${c.name}`, title: `Top ${c.name}`, valueLabel: "rows", filterColumn: c.name, data });
    }
  }

  // 6. Correlation insight between the two strongest measures.
  if (measures.length >= 2) {
    const r = pearson(rows, measures[0].name, measures[1].name);
    if (r !== null && Math.abs(r) >= 0.6) {
      insights.push(
        `${measures[0].name} and ${measures[1].name} move ${r > 0 ? "together" : "in opposite directions"} (r = ${r.toFixed(2)}).`
      );
    }
  }

  // Data quality note.
  const worstCol = [...ds.profiles].sort((a, b) => a.completeness - b.completeness)[0];
  if (worstCol && worstCol.completeness < 95) {
    insights.push(
      `${worstCol.name} is the least complete column at ${worstCol.completeness.toFixed(1)}% filled. Fix it in Dataset Doctor.`
    );
  }

  return { kpis, charts: charts.slice(0, MAX_CHARTS), insights: insights.slice(0, 6) };
}
