/* Business semantics: works out what a column *means*, not just what type it
 * holds. A number column called "revenue" and a number column called "latency"
 * are both numeric, but only one of them belongs in a Total Revenue tile.
 *
 * Everything here is name-and-distribution based, deliberately conservative:
 * when nothing matches we return nothing rather than guessing, because an
 * invented KPI is worse than a missing one. Pure logic, no UI. */

import type { Dataset, ColumnProfile, Row } from "./types";
import { parseNumeric } from "./number";
import { numericColumns, categoricalColumns, dateColumns } from "./auto-dashboard";

/** The business roles we can recognise from a column name. */
export type SemanticRole =
  | "revenue"
  | "profit"
  | "cost"
  | "quantity"
  | "unitPrice"
  | "discount"
  | "rate"
  | "customer"
  | "order"
  | "product"
  | "region"
  | "status"
  | "flag"
  | "date";

/** Word patterns per role. Matched against the normalised column name, so
 *  "Total_Revenue", "total revenue", and "TotalRevenue" all resolve alike. */
const ROLE_PATTERNS: { role: SemanticRole; pattern: RegExp }[] = [
  { role: "profit", pattern: /\b(profit|earnings|net ?income|gross ?margin|contribution)\b/ },
  { role: "revenue", pattern: /\b(revenue|sales|gmv|turnover|billings|gross ?sales|net ?sales|invoice ?total|order ?total|amount|total ?price|line ?total|subtotal)\b/ },
  { role: "cost", pattern: /\b(cost|cogs|expense|expenditure|spend|outlay|overhead|payroll|freight|shipping ?cost)\b/ },
  { role: "unitPrice", pattern: /\b(unit ?price|price|rate ?per|list ?price|msrp|tariff)\b/ },
  { role: "quantity", pattern: /\b(qty|quantity|units|volume|stock|inventory|on ?hand|pieces|items ?sold|headcount)\b/ },
  { role: "discount", pattern: /\b(discount|rebate|markdown|promo)\b/ },
  { role: "rate", pattern: /\b(rate|ratio|percent|percentage|pct|margin|share|utilisation|utilization|score)\b/ },
  { role: "customer", pattern: /\b(customer|client|account|buyer|member|subscriber|user|patient|student)\b/ },
  { role: "order", pattern: /\b(order|transaction|invoice|receipt|booking|shipment|ticket|deal|opportunity)\b/ },
  { role: "product", pattern: /\b(product|item|sku|category|segment|brand|service|plan|package)\b/ },
  { role: "region", pattern: /\b(region|country|state|province|city|territory|market|zone|branch|store|location|area)\b/ },
  { role: "status", pattern: /\b(status|state|stage|phase|outcome|result|disposition)\b/ },
  { role: "flag", pattern: /\b(is|has|active|churn|churned|converted|paid|returned|cancelled|canceled|subscribed|renewed|completed)\b/ },
];

/** Normalise a header for matching: snake/camel/kebab all become spaced words. */
export function normalizeName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The business role a column name suggests, or null when nothing fits. */
export function roleOf(name: string): SemanticRole | null {
  const normalized = normalizeName(name);
  for (const { role, pattern } of ROLE_PATTERNS) {
    if (pattern.test(normalized)) return role;
  }
  return null;
}

/** Values that read as "yes" in a conversion or activity flag column. */
const TRUTHY = new Set(["true", "yes", "y", "1", "active", "converted", "won", "paid", "completed", "complete", "success", "successful", "delivered", "approved", "renewed", "subscribed"]);

/** Status values that count as a successful outcome for conversion rate. */
const WON = new Set(["won", "converted", "closed won", "complete", "completed", "delivered", "paid", "success", "successful", "approved", "shipped", "fulfilled", "active", "subscribed", "renewed"]);

export function isTruthyValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  return TRUTHY.has(String(value).trim().toLowerCase());
}

export function isWonValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  return WON.has(String(value).trim().toLowerCase());
}

/** A currency symbol used consistently in a column's raw values, if any. We
 *  read the data rather than assume a locale, so a Naira column never renders
 *  with a dollar sign. */
export function detectCurrency(rows: Row[], column: string): string | null {
  const symbols = new Map<string, number>();
  let checked = 0;
  for (const row of rows) {
    const raw = row[column];
    if (typeof raw !== "string") continue;
    const match = raw.trim().match(/^\s*(?:-|\()?\s*([$€£¥₦₹])/);
    if (match) symbols.set(match[1], (symbols.get(match[1]) ?? 0) + 1);
    checked++;
    if (checked >= 400) break;
  }
  if (symbols.size !== 1) return null;
  const [symbol, count] = [...symbols][0];
  return count >= 3 ? symbol : null;
}

export interface SemanticColumn {
  name: string;
  role: SemanticRole;
  profile: ColumnProfile;
}

export interface DatasetSemantics {
  /** measures keyed by role, best candidate first */
  measures: Partial<Record<SemanticRole, SemanticColumn[]>>;
  /** dimension-like columns keyed by role */
  dimensions: Partial<Record<SemanticRole, SemanticColumn[]>>;
  /** the date column with the widest real spread, used for period comparisons */
  primaryDate: string | null;
  /** currency symbol shared by the money columns, when the data carries one */
  currency: string | null;
  /** every numeric column worth aggregating, best first */
  allMeasures: ColumnProfile[];
  /** every category-like column worth grouping by, best first */
  allDimensions: ColumnProfile[];
}

const MEASURE_ROLES = new Set<SemanticRole>(["revenue", "profit", "cost", "quantity", "unitPrice", "discount", "rate"]);

/** Rank measures by usefulness: complete columns with real spread first. */
function rankMeasures(profiles: ColumnProfile[]): ColumnProfile[] {
  return [...profiles].sort(
    (a, b) => b.completeness - a.completeness || b.uniqueCount - a.uniqueCount
  );
}

/** Rank dimensions by how well they slice: a handful of values beats hundreds. */
function rankDimensions(profiles: ColumnProfile[]): ColumnProfile[] {
  return [...profiles].sort((a, b) => {
    const aIdeal = a.uniqueCount >= 2 && a.uniqueCount <= 12 ? 0 : 1;
    const bIdeal = b.uniqueCount >= 2 && b.uniqueCount <= 12 ? 0 : 1;
    return aIdeal - bIdeal || a.uniqueCount - b.uniqueCount;
  });
}

/** Read a dataset's business shape once, so every KPI and panel decision below
 *  works from the same interpretation. */
export function readSemantics(ds: Dataset): DatasetSemantics {
  const allMeasures = rankMeasures(numericColumns(ds));
  const allDimensions = rankDimensions(categoricalColumns(ds));
  const dates = dateColumns(ds);

  const measures: Partial<Record<SemanticRole, SemanticColumn[]>> = {};
  const dimensions: Partial<Record<SemanticRole, SemanticColumn[]>> = {};

  for (const profile of allMeasures) {
    const role = roleOf(profile.name);
    if (role === null || !MEASURE_ROLES.has(role)) continue;
    (measures[role] ??= []).push({ name: profile.name, role, profile });
  }

  // Dimensions come from every non-measure column, including high-cardinality
  // identifiers: "customer_id" is useless as a chart axis but is exactly what a
  // distinct-customer count needs.
  for (const profile of ds.profiles) {
    if (profile.type === "date") continue;
    const role = roleOf(profile.name);
    if (role === null || MEASURE_ROLES.has(role)) continue;
    (dimensions[role] ??= []).push({ name: profile.name, role, profile });
  }

  // A stamp column that never varies ("exported_at") cannot anchor a trend.
  const spread = dates.find((d) => d.dateMin !== d.dateMax) ?? dates[0] ?? null;

  const moneyColumn =
    measures.revenue?.[0]?.name ?? measures.profit?.[0]?.name ?? measures.cost?.[0]?.name ?? null;

  return {
    measures,
    dimensions,
    primaryDate: spread?.name ?? null,
    currency: moneyColumn ? detectCurrency(ds.rows, moneyColumn) : null,
    allMeasures,
    allDimensions,
  };
}

/* ── aggregation helpers shared by the KPI layer ── */

/** Sum a numeric column across rows, ignoring cells that are not numeric. */
export function sumColumn(rows: Row[], column: string): number {
  let total = 0;
  for (const row of rows) {
    const n = parseNumeric(row[column]);
    if (n !== null) total += n;
  }
  return total;
}

/** Count the non-blank values in a column. */
export function countValues(rows: Row[], column: string): number {
  let count = 0;
  for (const row of rows) {
    const v = row[column];
    if (v !== null && v !== undefined && String(v).trim() !== "") count++;
  }
  return count;
}

/** Count distinct non-blank values in a column. */
export function distinctCount(rows: Row[], column: string): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = row[column];
    if (v === null || v === undefined) continue;
    const key = String(v).trim();
    if (key !== "") seen.add(key);
  }
  return seen.size;
}

/** Sum of quantity × unit price across rows where both are present. */
export function sumProduct(rows: Row[], columnA: string, columnB: string): number {
  let total = 0;
  for (const row of rows) {
    const a = parseNumeric(row[columnA]);
    const b = parseNumeric(row[columnB]);
    if (a !== null && b !== null) total += a * b;
  }
  return total;
}
