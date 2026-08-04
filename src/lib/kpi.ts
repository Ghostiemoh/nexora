/* Adaptive KPI engine. Reads a dataset's business semantics and produces the
 * tiles an analyst would actually put at the top of a dashboard: revenue,
 * profit, margin, order value, customers, growth.
 *
 * Two rules govern everything here:
 *   1. Row and column counts are metadata, not KPIs. They never appear.
 *   2. A KPI the data cannot support is omitted, never faked or zero-filled.
 *
 * Pure logic, no UI, so the decisions are unit-testable. */

import type { Dataset, Row } from "./types";
import { parseNumeric } from "./number";
import { parseStrictDate } from "./profile";
import { isExcelDateSerial } from "./clean";
import {
  readSemantics,
  sumColumn,
  distinctCount,
  countValues,
  sumProduct,
  isWonValue,
  isTruthyValue,
  normalizeName,
  type DatasetSemantics,
} from "./semantics";

export type KpiFormat = "currency" | "number" | "integer" | "percent";

export interface KpiSpec {
  id: string;
  label: string;
  value: number;
  format: KpiFormat;
  /** the same measure over the preceding window of equal length */
  previous?: number;
  /** signed percentage change against `previous` */
  deltaPct?: number;
  /** false for cost-style measures, where a rise is bad news */
  higherIsBetter: boolean;
  /** how the number was derived, shown on the tile so nothing is a black box */
  formula: string;
}

export interface PeriodComparison {
  current: Row[];
  previous: Row[];
  /** e.g. "2026-06-05 → 2026-07-05" */
  currentLabel: string;
  previousLabel: string;
  /** window length in days, equal for both sides so neither is a partial period */
  windowDays: number;
}

const DAY_MS = 86_400_000;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function readTimestamp(value: unknown): number | null {
  const t = parseStrictDate(value);
  if (t !== null) return t;
  const n = parseNumeric(value);
  if (n !== null && isExcelDateSerial(n)) return EXCEL_EPOCH_MS + n * DAY_MS;
  return null;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Split rows into the most recent window and the window immediately before it.
 *  Both windows are the same length, so a half-finished month can never make
 *  growth look like collapse. Returns null when there is not enough history. */
export function comparePeriods(rows: Row[], dateColumn: string): PeriodComparison | null {
  const stamped: { t: number; row: Row }[] = [];
  for (const row of rows) {
    const t = readTimestamp(row[dateColumn]);
    if (t !== null) stamped.push({ t, row });
  }
  if (stamped.length < 4) return null;

  const times = stamped.map((s) => s.t);
  const maxT = Math.max(...times);
  const spanDays = (maxT - Math.min(...times)) / DAY_MS;
  if (spanDays < 2) return null;

  // Window length tracks the span: yearly data compares years, a fortnight of
  // data compares days.
  const windowDays =
    spanDays > 730 ? 365 : spanDays > 92 ? 30 : spanDays > 14 ? 7 : 1;
  if (spanDays < windowDays * 2) return null;

  const currentStart = maxT - windowDays * DAY_MS;
  const previousStart = currentStart - windowDays * DAY_MS;

  const current: Row[] = [];
  const previous: Row[] = [];
  for (const { t, row } of stamped) {
    if (t > currentStart) current.push(row);
    else if (t > previousStart) previous.push(row);
  }
  if (current.length === 0 || previous.length === 0) return null;

  return {
    current,
    previous,
    currentLabel: `${isoDay(currentStart)} → ${isoDay(maxT)}`,
    previousLabel: `${isoDay(previousStart)} → ${isoDay(currentStart)}`,
    windowDays,
  };
}

function pctChange(current: number, previous: number): number | undefined {
  if (!Number.isFinite(previous) || previous === 0) return undefined;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** A measure evaluated over an arbitrary row set, so the same definition can be
 *  run against the current and previous windows. */
type Measure = (rows: Row[]) => number | null;

interface Candidate {
  id: string;
  label: string;
  format: KpiFormat;
  formula: string;
  higherIsBetter?: boolean;
  compute: Measure;
  /** ratios and averages are not comparable across windows of different sizes,
   *  but rates are; both are fine here since windows are equal length */
  comparable?: boolean;
}

/* ── the candidate catalogue ── */

function catalogue(ds: Dataset, sem: DatasetSemantics): Candidate[] {
  const out: Candidate[] = [];

  const revenue = sem.measures.revenue?.[0]?.name ?? null;
  const profit = sem.measures.profit?.[0]?.name ?? null;
  const cost = sem.measures.cost?.[0]?.name ?? null;
  const quantity = sem.measures.quantity?.[0]?.name ?? null;
  const unitPrice = sem.measures.unitPrice?.[0]?.name ?? null;
  const customer = sem.dimensions.customer?.[0]?.name ?? null;
  const order = sem.dimensions.order?.[0]?.name ?? null;
  const status = sem.dimensions.status?.[0] ?? null;
  const flag = sem.dimensions.flag?.[0] ?? null;

  if (revenue) {
    out.push({
      id: "revenue",
      label: `Total ${titleize(revenue)}`,
      format: "currency",
      formula: `SUM(${revenue})`,
      compute: (rows) => sumColumn(rows, revenue),
    });
  }

  if (profit) {
    out.push({
      id: "profit",
      label: `Total ${titleize(profit)}`,
      format: "currency",
      formula: `SUM(${profit})`,
      compute: (rows) => sumColumn(rows, profit),
    });
  } else if (revenue && cost) {
    // No profit column, but revenue minus cost is the same number an analyst
    // would work out by hand.
    out.push({
      id: "derived_profit",
      label: "Gross Profit",
      format: "currency",
      formula: `SUM(${revenue}) − SUM(${cost})`,
      compute: (rows) => sumColumn(rows, revenue) - sumColumn(rows, cost),
    });
  }

  if (revenue && (profit || cost)) {
    out.push({
      id: "margin",
      label: "Profit Margin",
      format: "percent",
      formula: profit ? `SUM(${profit}) ÷ SUM(${revenue})` : `(SUM(${revenue}) − SUM(${cost})) ÷ SUM(${revenue})`,
      compute: (rows) => {
        const rev = sumColumn(rows, revenue);
        if (rev === 0) return null;
        const gain = profit ? sumColumn(rows, profit) : rev - sumColumn(rows, cost!);
        return (gain / rev) * 100;
      },
    });
  }

  if (order) {
    out.push({
      id: "orders",
      label: pluralize(titleize(order, true)),
      format: "integer",
      formula: `COUNT(DISTINCT ${order})`,
      compute: (rows) => distinctCount(rows, order),
    });
  }

  if (customer) {
    out.push({
      id: "customers",
      label: pluralize(titleize(customer, true)),
      format: "integer",
      formula: `COUNT(DISTINCT ${customer})`,
      compute: (rows) => distinctCount(rows, customer),
    });
  }

  if (revenue) {
    // Average order value divides by orders when an order key exists, and by
    // records otherwise, which is what a row means in a transaction extract.
    const denominatorLabel = order ? `COUNT(DISTINCT ${order})` : "COUNT(rows)";
    out.push({
      id: "aov",
      label: "Average Order Value",
      format: "currency",
      formula: `SUM(${revenue}) ÷ ${denominatorLabel}`,
      compute: (rows) => {
        const denominator = order ? distinctCount(rows, order) : rows.length;
        if (denominator === 0) return null;
        return sumColumn(rows, revenue) / denominator;
      },
    });
  }

  if (quantity) {
    const isStock = /\b(stock|inventory|on hand)\b/.test(normalizeName(quantity));
    out.push({
      id: "quantity",
      label: isStock ? `Total ${titleize(quantity)}` : `Units Sold`,
      format: "number",
      formula: `SUM(${quantity})`,
      compute: (rows) => sumColumn(rows, quantity),
    });
    if (isStock && unitPrice) {
      out.push({
        id: "inventory_value",
        label: "Inventory Value",
        format: "currency",
        formula: `SUM(${quantity} × ${unitPrice})`,
        compute: (rows) => sumProduct(rows, quantity, unitPrice),
      });
    }
  }

  // Conversion rate: an explicit outcome column beats inferring from anything
  // else, and a boolean flag is the next best signal.
  const outcome = status ?? flag;
  if (outcome && outcome.profile.uniqueCount <= 12) {
    const column = outcome.name;
    const test = outcome === status ? isWonValue : isTruthyValue;
    out.push({
      id: "conversion",
      label: outcome === status ? "Conversion Rate" : `${titleize(column)} Rate`,
      format: "percent",
      formula: `share of rows where ${column} is a positive outcome`,
      compute: (rows) => {
        const known = countValues(rows, column);
        if (known === 0) return null;
        let hits = 0;
        for (const row of rows) if (test(row[column])) hits++;
        // A column where nothing matches is not an outcome column after all.
        return hits === 0 ? null : (hits / known) * 100;
      },
    });

    if (customer && outcome === flag) {
      out.push({
        id: "active_users",
        label: `Active ${pluralize(titleize(customer, true))}`,
        format: "integer",
        formula: `COUNT(DISTINCT ${customer}) where ${column} is true`,
        compute: (rows) => {
          const active = rows.filter((r) => isTruthyValue(r[column]));
          return active.length === 0 ? null : distinctCount(active, customer);
        },
      });
    }
  }

  // Cost sits below the outcome measures: where profit and margin are already
  // on the row, the spend behind them is implied rather than headline news.
  if (cost) {
    out.push({
      id: "cost",
      label: `Total ${titleize(cost)}`,
      format: "currency",
      formula: `SUM(${cost})`,
      higherIsBetter: false,
      compute: (rows) => sumColumn(rows, cost),
    });
  }

  /* Generic fallbacks. A dataset with no business vocabulary still deserves a
   * meaningful headline, so the strongest numeric columns are totalled and
   * averaged, and the clearest dimension is counted. */
  for (const measure of sem.allMeasures.slice(0, 3)) {
    if (out.some((c) => c.formula.includes(`(${measure.name})`))) continue;
    out.push({
      id: `total_${measure.name}`,
      label: `Total ${titleize(measure.name)}`,
      format: "number",
      formula: `SUM(${measure.name})`,
      compute: (rows) => sumColumn(rows, measure.name),
    });
    out.push({
      id: `avg_${measure.name}`,
      label: `Average ${titleize(measure.name)}`,
      format: "number",
      formula: `AVG(${measure.name})`,
      compute: (rows) => {
        const values = rows
          .map((r) => parseNumeric(r[measure.name]))
          .filter((n): n is number => n !== null);
        return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
      },
    });
  }

  for (const dimension of sem.allDimensions.slice(0, 2)) {
    out.push({
      id: `distinct_${dimension.name}`,
      label: `Distinct ${titleize(dimension.name)}`,
      format: "integer",
      formula: `COUNT(DISTINCT ${dimension.name})`,
      compute: (rows) => distinctCount(rows, dimension.name),
    });
  }

  return out;
}

/** Words that read wrong in title case: "Api Calls" is not a thing. */
const ACRONYMS = new Set([
  "api", "id", "url", "uri", "sku", "kpi", "gmv", "aov", "arr", "mrr", "roi",
  "usd", "ngn", "eur", "gbp", "vat", "cpu", "ram", "ip", "sla", "ltv", "cac",
  "eps", "ebitda", "yoy", "mom", "qoq", "ytd", "utm", "crm", "csv", "sql",
]);

/** "total_revenue" → "Total Revenue"; identifier suffixes are dropped when the
 *  label names a thing being counted, so "customer_id" reads as "Customer". */
export function titleize(name: string, stripIdSuffix = false): string {
  let words = normalizeName(name).split(" ");
  if (stripIdSuffix) {
    words = words.filter((w) => w !== "id" && w !== "no" && w !== "number" && w !== "code" && w !== "key");
    if (words.length === 0) words = [normalizeName(name)];
  }
  return words
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** English plural for a KPI label. Only the regular cases matter here, since
 *  the input is a column name rather than arbitrary prose. */
export function pluralize(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export interface KpiResult {
  kpis: KpiSpec[];
  /** the window the deltas compare, so the UI can caption the whole row once */
  comparison: PeriodComparison | null;
  currency: string | null;
}

const MAX_KPIS = 6;

/** Build the KPI row for a dataset, optionally against a filtered subset.
 *  Column typing always comes from the full dataset so a filter can never
 *  change what a column *means*. */
export function buildKpis(ds: Dataset, rowsOverride?: Row[]): KpiResult {
  const rows = rowsOverride ?? ds.rows;
  const sem = readSemantics(ds);
  const comparison = sem.primaryDate ? comparePeriods(rows, sem.primaryDate) : null;

  const kpis: KpiSpec[] = [];
  const seen = new Set<string>();

  for (const candidate of catalogue(ds, sem)) {
    if (kpis.length >= MAX_KPIS) break;
    if (seen.has(candidate.label)) continue;

    const value = candidate.compute(rows);
    if (value === null || !Number.isFinite(value)) continue;

    const spec: KpiSpec = {
      id: candidate.id,
      label: candidate.label,
      value,
      format: candidate.format,
      higherIsBetter: candidate.higherIsBetter ?? true,
      formula: candidate.formula,
    };

    if (comparison) {
      const previous = candidate.compute(comparison.previous);
      const current = candidate.compute(comparison.current);
      if (previous !== null && current !== null && Number.isFinite(previous) && Number.isFinite(current)) {
        const delta = pctChange(current, previous);
        if (delta !== undefined) {
          spec.previous = previous;
          spec.deltaPct = delta;
        }
      }
    }

    seen.add(candidate.label);
    kpis.push(spec);
  }

  return { kpis, comparison, currency: sem.currency };
}

/* ── formatting ── */

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Render a KPI value the way a finance deck would: compact above ten thousand,
 *  two decimals for money, whole numbers for counts. */
export function formatKpiValue(kpi: KpiSpec, currency: string | null): string {
  if (kpi.format === "percent") return `${kpi.value.toFixed(1)}%`;

  const abs = Math.abs(kpi.value);
  const symbol = kpi.format === "currency" && currency ? currency : "";

  if (abs >= 100_000) return `${symbol}${COMPACT.format(kpi.value)}`;
  if (kpi.format === "integer") return kpi.value.toLocaleString("en-US");
  if (kpi.format === "currency") {
    return `${symbol}${kpi.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return kpi.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
