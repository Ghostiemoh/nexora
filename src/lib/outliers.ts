/* Outlier investigation.
 *
 * The default move in most tools is to treat an extreme value as damage and
 * offer to cap it. That is occasionally right and frequently expensive: the
 * row you just winsorized may have been the largest customer on the books, the
 * fraud you were hired to find, or the month the business changed.
 *
 * So nothing here returns a verdict. analyzeOutliers finds the extremes, shows
 * where they sit, contrasts them against the rest of the file, and then offers
 * the readings that actually fit the shape of the data, each with the check
 * that would confirm it. Deciding is the analyst's job, and the point of this
 * module is to make that decision an informed one.
 *
 * Detection is Tukey's 1.5 x IQR fence, chosen over standard deviations
 * because the standard deviation is itself dragged around by the outliers it
 * is being used to find. */

import type { Dataset, Row } from "./types";

export interface OutlierRecord {
  /** index into dataset.rows, so the UI can show the whole record */
  rowIndex: number;
  value: number;
  /** how many IQRs past the fence, so records can be ranked by extremity */
  deviation: number;
  direction: "high" | "low";
}

export interface OutlierSegment {
  column: string;
  segment: string;
  /** % of this segment's rows that are outliers */
  outlierRate: number;
  /** % of all rows that are outliers */
  baseRate: number;
  count: number;
}

export interface OutlierContrast {
  column: string;
  outlierMean: number;
  normalMean: number;
  /** outlierMean / normalMean, or null when normalMean is 0 */
  ratio: number | null;
}

/** One way of reading the extremes, with what would settle it. */
export interface OutlierReading {
  id: "segment" | "sentinel" | "sign" | "scale" | "concentration" | "timing" | "genuine";
  label: string;
  rationale: string;
  /** the concrete thing to go and look at */
  check: string;
}

export interface OutlierReport {
  column: string;
  count: number;
  /** % of non-null values that are outliers */
  pct: number;
  method: "iqr";
  lowerFence: number;
  upperFence: number;
  high: number;
  low: number;
  /** % of the column's total value carried by the outlying rows */
  valueShare: number;
  /** most extreme first, capped for display */
  records: OutlierRecord[];
  segments: OutlierSegment[];
  contrasts: OutlierContrast[];
  readings: OutlierReading[];
  questions: string[];
}

const MAX_RECORDS = 50;
/* Deliberately lower than the equivalent floor in missingness.ts. There, a
 * segment is a slice of the file and needs enough rows for a rate to mean
 * something. Here the interesting segment is often tiny by nature: six
 * enterprise accounts among two hundred retail ones is the textbook case of
 * extremes that are real, and a floor of ten would hide exactly the group the
 * analyst most needs to see. The lift requirement below does the filtering. */
const MIN_SEGMENT_ROWS = 5;
const MAX_SEGMENTS = 25;
/** Outlier rate in a segment has to beat the base rate by this multiple before
 *  it is worth a sentence. */
const SEGMENT_LIFT = 2;

const isMissing = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const pct = (part: number, whole: number): number =>
  whole === 0 ? 0 : round((part / whole) * 100, 1);

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const EMPTY = (column: string): OutlierReport => ({
  column,
  count: 0,
  pct: 0,
  method: "iqr",
  lowerFence: 0,
  upperFence: 0,
  high: 0,
  low: 0,
  valueShare: 0,
  records: [],
  segments: [],
  contrasts: [],
  readings: [],
  questions: [],
});

/** Investigate the extreme values in one numeric column. */
export function analyzeOutliers(dataset: Dataset, column: string): OutlierReport {
  const profile = dataset.profiles.find((p) => p.name === column);
  if (!profile || profile.type !== "number") return EMPTY(column);

  const rows = dataset.rows;
  const values: { rowIndex: number; value: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = num(rows[i][column]);
    if (v !== null) values.push({ rowIndex: i, value: v });
  }
  if (values.length < 8) return EMPTY(column);

  const sorted = values.map((v) => v.value).sort((a, b) => a - b);
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  const iqr = p75 - p25;

  // A zero IQR means at least half the values are identical. Fences would then
  // brand every distinct value an outlier, which is noise, not a finding.
  if (iqr <= 0) return EMPTY(column);

  const lowerFence = p25 - 1.5 * iqr;
  const upperFence = p75 + 1.5 * iqr;

  const records: OutlierRecord[] = [];
  for (const { rowIndex, value } of values) {
    if (value > upperFence) {
      records.push({ rowIndex, value, deviation: round((value - upperFence) / iqr), direction: "high" });
    } else if (value < lowerFence) {
      records.push({ rowIndex, value, deviation: round((lowerFence - value) / iqr), direction: "low" });
    }
  }
  if (records.length === 0) return EMPTY(column);

  records.sort((a, b) => b.deviation - a.deviation);

  const high = records.filter((r) => r.direction === "high").length;
  const low = records.length - high;
  const total = sorted.reduce((s, v) => s + v, 0);
  const outlierTotal = records.reduce((s, r) => s + r.value, 0);
  const valueShare = total === 0 ? 0 : pct(Math.abs(outlierTotal), Math.abs(total));

  const outlierIndexes = new Set(records.map((r) => r.rowIndex));
  const baseRate = pct(records.length, values.length);

  const segments = findSegments(dataset, rows, column, outlierIndexes, baseRate);
  const contrasts = buildContrasts(dataset, rows, column, outlierIndexes);
  const readings = buildReadings({
    column,
    records,
    segments,
    valueShare,
    high,
    low,
    values: values.length,
    negativeShare: pct(sorted.filter((v) => v < 0).length, sorted.length),
  });

  return {
    column,
    count: records.length,
    pct: baseRate,
    method: "iqr",
    lowerFence: round(lowerFence),
    upperFence: round(upperFence),
    high,
    low,
    valueShare,
    records: records.slice(0, MAX_RECORDS),
    segments,
    contrasts,
    readings,
    questions: buildQuestions(column, segments, records),
  };
}

/** Categorical columns where outliers land far more often than they should. */
function findSegments(
  dataset: Dataset,
  rows: Row[],
  column: string,
  outlierIndexes: Set<number>,
  baseRate: number
): OutlierSegment[] {
  const out: OutlierSegment[] = [];

  for (const profile of dataset.profiles) {
    if (profile.name === column) continue;
    if (profile.type !== "category" && profile.type !== "boolean" && profile.type !== "string") {
      continue;
    }

    const counts = new Map<string, { total: number; outliers: number }>();
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i][profile.name];
      if (isMissing(raw)) continue;
      const key = String(raw);
      const cell = counts.get(key) ?? { total: 0, outliers: 0 };
      cell.total++;
      if (outlierIndexes.has(i)) cell.outliers++;
      counts.set(key, cell);
    }

    if (counts.size < 2 || counts.size > MAX_SEGMENTS) continue;

    for (const [segment, c] of counts) {
      if (c.total < MIN_SEGMENT_ROWS || c.outliers === 0) continue;
      const rate = pct(c.outliers, c.total);
      if (rate >= baseRate * SEGMENT_LIFT) {
        out.push({ column: profile.name, segment, outlierRate: rate, baseRate, count: c.outliers });
      }
    }
  }

  return out.sort((a, b) => b.outlierRate - a.outlierRate).slice(0, 5);
}

/** How outlier rows differ from normal rows on the other numeric columns. */
function buildContrasts(
  dataset: Dataset,
  rows: Row[],
  column: string,
  outlierIndexes: Set<number>
): OutlierContrast[] {
  const out: OutlierContrast[] = [];

  for (const profile of dataset.profiles) {
    if (profile.name === column || profile.type !== "number") continue;

    let outSum = 0;
    let outN = 0;
    let normSum = 0;
    let normN = 0;

    for (let i = 0; i < rows.length; i++) {
      const v = num(rows[i][profile.name]);
      if (v === null) continue;
      if (outlierIndexes.has(i)) {
        outSum += v;
        outN++;
      } else {
        normSum += v;
        normN++;
      }
    }

    if (outN === 0 || normN === 0) continue;
    const outlierMean = round(outSum / outN);
    const normalMean = round(normSum / normN);
    out.push({
      column: profile.name,
      outlierMean,
      normalMean,
      ratio: normalMean === 0 ? null : round(outlierMean / normalMean),
    });
  }

  // Biggest divergence first: that is the column most worth looking at.
  return out
    .sort((a, b) => Math.abs((b.ratio ?? 1) - 1) - Math.abs((a.ratio ?? 1) - 1))
    .slice(0, 6);
}

/** Is n a suspiciously round number, of the kind a person types or a system
 *  writes as a placeholder? */
function isRound(n: number): boolean {
  const abs = Math.abs(n);
  if (abs === 0) return false;
  return abs % 1000 === 0 || abs % 10000 === 0 || /^9+$/.test(String(abs).replace(/0+$/, "9"));
}

function buildReadings(input: {
  column: string;
  records: OutlierRecord[];
  segments: OutlierSegment[];
  valueShare: number;
  high: number;
  low: number;
  values: number;
  /** % of all non-null values in the column that are negative */
  negativeShare: number;
}): OutlierReading[] {
  const { column, records, segments, valueShare, low } = input;
  const readings: OutlierReading[] = [];

  // Concentrated in one group: the most common benign explanation, and the one
  // most often destroyed by capping.
  const top = segments[0];
  if (top) {
    readings.push({
      id: "segment",
      label: `A real difference between groups, not bad data`,
      rationale: `${top.outlierRate}% of ${top.column} = ${top.segment} rows are extreme on ${column}, against ${top.baseRate}% across the file. Values that cluster inside one group usually mean the group genuinely behaves differently, and that the file mixes two populations rather than holding one with errors in it.`,
      check: `Look at a handful of ${top.segment} records end to end. If they read as coherent business records, model ${top.column} separately instead of capping ${column}.`,
    });
  }

  // Repeated identical extreme: the fingerprint of a machine, not of customers.
  const valueCounts = new Map<number, number>();
  for (const r of records) valueCounts.set(r.value, (valueCounts.get(r.value) ?? 0) + 1);
  const repeated = [...valueCounts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])[0];
  if (repeated) {
    readings.push({
      id: "sentinel",
      label: `A placeholder value written by a system`,
      rationale: `The value ${repeated[0].toLocaleString()} appears ${repeated[1]} times among the extremes. Independent real-world measurements do not repeat exactly; codes like 9999, 999999, or a maximum field width do. This is likely "no value" wearing a number.`,
      check: `Search the source system for ${repeated[0].toLocaleString()} as a default or error code. If it is one, convert those cells to missing before anything else, because every average in the file is currently wrong.`,
    });
  }

  // Negatives in an otherwise positive column. The test is about the column,
  // not about the outlier set: when the single extreme IS the negative, every
  // outlier is negative, and an earlier version of this check missed the one
  // case it existed for.
  const negativeOutliers = records.filter((r) => r.value < 0).length;
  if (low > 0 && negativeOutliers > 0 && input.negativeShare < 10) {
    readings.push({
      id: "sign",
      label: `A sign error, a refund, or a reversal`,
      rationale: `${column} runs positive almost everywhere but goes negative in ${negativeOutliers} row(s). Negatives in a mostly positive measure are usually either a genuine reversal that belongs in the data or a sign that slipped during entry.`,
      check: `Pull those rows and check whether a matching positive record exists nearby. A pair means refunds, which you should keep and label. No pair means the sign is probably wrong.`,
    });
  }

  // Round-number extremes: the shape of a slipped decimal or a typed guess.
  const roundOnes = records.filter((r) => isRound(r.value));
  if (roundOnes.length > 0 && roundOnes.length <= Math.max(3, records.length * 0.5)) {
    readings.push({
      id: "scale",
      label: `A decimal point or unit that slipped`,
      rationale: `${roundOnes.length} of the extremes are round numbers such as ${roundOnes[0].value.toLocaleString()}. A value that is exactly 10x or 1000x the usual scale, and round, is more often a keying slip or a unit mismatch than a real measurement.`,
      check: `Divide the suspect values by 10, 100, and 1000. If one of those lands them neatly inside the normal range, compare against the source document before deciding.`,
    });
  }

  // A few rows carrying a large share of the total is a business fact.
  if (valueShare >= 20) {
    readings.push({
      id: "concentration",
      label: `Genuine concentration, and a risk worth naming`,
      rationale: `${records.length} row(s) carry ${valueShare}% of the total ${column}. If these are real, the headline number depends on very few records, so an average describes almost nobody and losing one of these rows moves the whole figure.`,
      check: `Report a median alongside the mean, and check whether these records are stable over time or one-offs. Either way this belongs in the summary rather than in a cleaning step.`,
    });
  }

  // Always leave the door open on the one thing the data cannot rule out.
  readings.push({
    id: "genuine",
    label: `Correct values from an unusual event`,
    rationale: `Nothing in the distribution can distinguish a real spike from a bad one. A campaign, a bulk order, a price change, or a single large customer all produce exactly this shape, and each is information rather than noise.`,
    check: `Ask someone who knows the period what happened. If the extremes line up with a known event, keep them and say so in the report, because removing them would hide the most interesting thing in the file.`,
  });

  return readings;
}

function buildQuestions(
  column: string,
  segments: OutlierSegment[],
  records: OutlierRecord[]
): string[] {
  const questions = [
    `Show me the rows with the most extreme ${column} values and how they differ from a typical row.`,
    `How much does the average ${column} change if I exclude the ${records.length} extreme row(s)?`,
  ];

  const top = segments[0];
  if (top) {
    questions.push(
      `The extremes in ${column} concentrate in ${top.column} = ${top.segment}. Is that segment different across the board, or only on ${column}?`
    );
  }

  questions.push(
    `Do the extreme ${column} values look like genuine records or like data entry problems, and what in the data supports your answer?`
  );

  return questions;
}
