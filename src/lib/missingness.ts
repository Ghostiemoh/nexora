/* Why values are missing, investigated rather than patched.
 *
 * Filling a gap with the median is a decision, and it should be the last step
 * of an investigation instead of the first. A gap can be a broken export, a
 * field that only applies to some customers, a question people decline to
 * answer, or a real business signal. Those call for different responses, and
 * the difference is visible in the data if you look.
 *
 * The framework is Rubin's, and its three cases are not equally knowable:
 *
 *   MCAR  missingness is independent of everything. Cannot be proven, only
 *         left undisproven, so this module says "consistent with" and never
 *         "is".
 *   MAR   missingness depends on data you CAN see. Testable: build a
 *         contingency table of segment against missing/present and test it.
 *   MNAR  missingness depends on the missing value itself. Untestable from
 *         observed data by construction, because the evidence that would
 *         settle it is the part that is absent. It is raised here only ever as
 *         a hypothesis with a reason to go and check.
 *
 * Every statement carries the kind of claim it is, so a reader can tell a
 * counted fact from a test result from a guess. */

import type { Dataset, Row } from "./types";

/** What kind of claim a sentence is making.
 *  observed: counted directly off the rows.
 *  supported: the output of a statistical test, with its assumptions.
 *  hypothesis: a possible explanation the data cannot settle either way. */
export type EvidenceStrength = "observed" | "supported" | "hypothesis";

export interface Evidence {
  strength: EvidenceStrength;
  text: string;
}

export interface MissingnessAssociation {
  /** the observable column whose distribution shifts with missingness */
  column: string;
  /** the value of that column most over-represented among missing rows */
  segment: string;
  /** % of missing rows sitting in this segment */
  missingShare: number;
  /** % of complete rows sitting in this segment */
  presentShare: number;
  /** percentage points between the two shares */
  lift: number;
  /** missing rows in this segment */
  rows: number;
  /** effect size for the whole column, 0 to 1 */
  cramersV: number;
  /** significance of the column's contingency table */
  pValue: number;
}

export interface TimeConcentration {
  column: string;
  /** ISO date on the later side of the sharpest jump in missing rate */
  onset: string;
  /** missing rate before the onset, % */
  beforeRate: number;
  /** missing rate from the onset onward, % */
  afterRate: number;
}

export type MissingnessVerdict = "none" | "MCAR" | "MAR";

export interface MissingnessReport {
  column: string;
  missingCount: number;
  missingPct: number;
  verdict: MissingnessVerdict;
  /** how far the verdict can be trusted. Never "observed": a mechanism is
   *  always an inference, even when the counts behind it are exact. */
  confidence: EvidenceStrength;
  evidence: Evidence[];
  /** strongest first */
  associations: MissingnessAssociation[];
  timing: TimeConcentration | null;
  /** ready-made prompts for the AI analyst, grounded in this column */
  questions: string[];
}

/* ── statistics ─────────────────────────────────────────────────────────── */

/** Regularized lower incomplete gamma P(a, x) by series expansion.
 *  Converges quickly for x < a + 1. */
function lowerGamma(a: number, x: number): number {
  let sum = 1 / a;
  let term = sum;
  for (let n = 1; n < 500; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Regularized upper incomplete gamma Q(a, x) by continued fraction.
 *  Converges quickly for x >= a + 1. */
function upperGamma(a: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Lanczos approximation, g = 7, n = 9. Accurate to ~15 digits for a > 0. */
function logGamma(a: number): number {
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (a < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * a)) - logGamma(1 - a);
  }
  const z = a - 1;
  let x = g[0];
  for (let i = 1; i < 9; i++) x += g[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** P(X > chi2) for a chi-square distribution with `df` degrees of freedom.
 *  Small return value means the observed table would be unlikely if the two
 *  variables were independent. */
export function chiSquarePValue(chi2: number, df: number): number {
  if (!Number.isFinite(chi2) || chi2 <= 0) return 1;
  if (df <= 0) return 1;
  const a = df / 2;
  const x = chi2 / 2;
  const q = x < a + 1 ? 1 - lowerGamma(a, x) : upperGamma(a, x);
  return Math.min(1, Math.max(0, q));
}

/** Effect size for a 2-column contingency table. Independent of sample size,
 *  which is what makes it comparable across columns and worth ranking on:
 *  a big enough n makes almost any p-value small. */
export function cramersV(chi2: number, n: number): number {
  if (n <= 0 || chi2 <= 0) return 0;
  return Math.min(1, Math.sqrt(chi2 / n));
}

/* ── thresholds ─────────────────────────────────────────────────────────── */

/** Below this, a segment has too few rows for its rate to mean anything. */
const MIN_SEGMENT_ROWS = 15;
/** A column with more distinct values than this describes rows, not groups,
 *  and would "explain" any pattern you handed it. */
const MAX_SEGMENTS = 25;
/** Effect size worth showing a human. Below it, statistically detectable but
 *  not something to act on. */
const MIN_EFFECT = 0.2;
const SIGNIFICANCE = 0.05;
/** Percentage points of jump in missing rate before/after a date that counts
 *  as an onset rather than drift. */
const ONSET_JUMP = 40;

const isMissing = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const pct = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

/* ── association testing ────────────────────────────────────────────────── */

/** Test one candidate column against the missing/present split of the target. */
function testColumn(
  rows: Row[],
  candidate: string,
  missingFlags: boolean[]
): MissingnessAssociation | null {
  const counts = new Map<string, { missing: number; present: number }>();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][candidate];
    if (isMissing(raw)) continue;
    const key = String(raw);
    const cell = counts.get(key) ?? { missing: 0, present: 0 };
    if (missingFlags[i]) cell.missing++;
    else cell.present++;
    counts.set(key, cell);
  }

  if (counts.size < 2 || counts.size > MAX_SEGMENTS) return null;

  const usable = [...counts.entries()].filter(
    ([, c]) => c.missing + c.present >= MIN_SEGMENT_ROWS
  );
  if (usable.length < 2) return null;

  const totalMissing = usable.reduce((s, [, c]) => s + c.missing, 0);
  const totalPresent = usable.reduce((s, [, c]) => s + c.present, 0);
  const n = totalMissing + totalPresent;
  if (totalMissing === 0 || totalPresent === 0 || n === 0) return null;

  // Pearson chi-square across the segment x {missing, present} table.
  let chi2 = 0;
  for (const [, c] of usable) {
    const rowTotal = c.missing + c.present;
    const expMissing = (rowTotal * totalMissing) / n;
    const expPresent = (rowTotal * totalPresent) / n;
    if (expMissing > 0) chi2 += (c.missing - expMissing) ** 2 / expMissing;
    if (expPresent > 0) chi2 += (c.present - expPresent) ** 2 / expPresent;
  }

  const df = usable.length - 1;
  const pValue = chiSquarePValue(chi2, df);
  const v = cramersV(chi2, n);

  // Name the segment carrying the most of the gap, by share difference rather
  // than raw count, so a large segment does not always win.
  let best = usable[0];
  let bestLift = -Infinity;
  for (const entry of usable) {
    const lift = pct(entry[1].missing, totalMissing) - pct(entry[1].present, totalPresent);
    if (lift > bestLift) {
      bestLift = lift;
      best = entry;
    }
  }

  return {
    column: candidate,
    segment: best[0],
    missingShare: pct(best[1].missing, totalMissing),
    presentShare: pct(best[1].present, totalPresent),
    lift: Math.round(bestLift * 10) / 10,
    rows: best[1].missing,
    cramersV: Math.round(v * 1000) / 1000,
    pValue,
  };
}

/* ── timing ─────────────────────────────────────────────────────────────── */

/** Find a date column where the missing rate jumps sharply at one point.
 *  A clean break is the signature of a process change rather than a pattern in
 *  the subject matter. */
function findOnset(
  dataset: Dataset,
  rows: Row[],
  target: string,
  missingFlags: boolean[]
): TimeConcentration | null {
  const dateColumns = dataset.profiles
    .filter((p) => p.type === "date" && p.name !== target)
    .map((p) => p.name);

  for (const column of dateColumns) {
    const points: { date: string; missing: boolean }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i][column];
      if (isMissing(raw)) continue;
      points.push({ date: String(raw), missing: missingFlags[i] });
    }
    if (points.length < MIN_SEGMENT_ROWS * 2) continue;

    points.sort((a, b) => a.date.localeCompare(b.date));

    const total = points.length;
    const totalMissing = points.reduce((s, p) => s + (p.missing ? 1 : 0), 0);
    if (totalMissing === 0 || totalMissing === total) continue;

    // Sweep every split point and keep the sharpest before/after contrast.
    let bestJump = 0;
    let best: TimeConcentration | null = null;
    let missingSoFar = 0;

    for (let i = 0; i < total - 1; i++) {
      if (points[i].missing) missingSoFar++;
      const beforeCount = i + 1;
      const afterCount = total - beforeCount;
      if (beforeCount < MIN_SEGMENT_ROWS || afterCount < MIN_SEGMENT_ROWS) continue;
      // Only split where the date actually changes, so a run of equal dates is
      // never cut down the middle.
      if (points[i].date === points[i + 1].date) continue;

      const beforeRate = pct(missingSoFar, beforeCount);
      const afterRate = pct(totalMissing - missingSoFar, afterCount);
      const jump = Math.abs(afterRate - beforeRate);

      if (jump > bestJump) {
        bestJump = jump;
        best = { column, onset: points[i + 1].date, beforeRate, afterRate };
      }
    }

    if (best && bestJump >= ONSET_JUMP) return best;
  }

  return null;
}

/* ── report ─────────────────────────────────────────────────────────────── */

const EMPTY = (column: string): MissingnessReport => ({
  column,
  missingCount: 0,
  missingPct: 0,
  verdict: "none",
  confidence: "observed",
  evidence: [],
  associations: [],
  timing: null,
  questions: [],
});

/** Investigate why one column's values are missing. */
export function analyzeMissingness(dataset: Dataset, column: string): MissingnessReport {
  const rows = dataset.rows;
  if (!dataset.columns.includes(column) || rows.length === 0) return EMPTY(column);

  const missingFlags = rows.map((r) => isMissing(r[column]));
  const missingCount = missingFlags.reduce((s, m) => s + (m ? 1 : 0), 0);
  if (missingCount === 0) return EMPTY(column);

  const missingPct = pct(missingCount, rows.length);
  const evidence: Evidence[] = [
    {
      strength: "observed",
      text: `${missingCount.toLocaleString()} of ${rows.length.toLocaleString()} rows (${missingPct}%) have no value for ${column}.`,
    },
  ];

  // With nothing left present there is nothing to compare against.
  const everythingMissing = missingCount === rows.length;

  const associations = everythingMissing
    ? []
    : dataset.profiles
        // "category" is what the profiler calls a low-cardinality string, so it
        // is the type most likely to carry the answer. Free-text "string"
        // columns are kept too and filtered later on distinct-value count.
        .filter(
          (p) =>
            p.name !== column &&
            (p.type === "category" || p.type === "string" || p.type === "boolean")
        )
        .map((p) => testColumn(rows, p.name, missingFlags))
        .filter((a): a is MissingnessAssociation => a !== null)
        .filter((a) => a.pValue < SIGNIFICANCE && a.cramersV >= MIN_EFFECT)
        .sort((a, b) => b.cramersV - a.cramersV);

  const timing = everythingMissing ? null : findOnset(dataset, rows, column, missingFlags);

  let verdict: MissingnessVerdict;
  let confidence: EvidenceStrength;

  if (everythingMissing) {
    verdict = "none";
    confidence = "observed";
    evidence.push({
      strength: "observed",
      text: `Every row is empty, so there is nothing to compare against and no pattern to find. This column carries no information as it stands.`,
    });
  } else if (associations.length > 0) {
    verdict = "MAR";
    confidence = "supported";
    const top = associations[0];
    evidence.push({
      strength: "observed",
      text: `${top.missingShare}% of the rows missing ${column} are ${top.column} = ${top.segment}, against ${top.presentShare}% of the rows that have a value.`,
    });
    evidence.push({
      strength: "supported",
      text: `That gap is unlikely to be chance (chi-square p ${top.pValue < 0.001 ? "< 0.001" : `= ${top.pValue.toFixed(3)}`}, Cramér's V ${top.cramersV.toFixed(2)}). Missingness depends on ${top.column}, which is data you already hold, so this fits Missing At Random.`,
    });
    evidence.push({
      strength: "hypothesis",
      text: `Practically, that usually means ${top.column} = ${top.segment} runs through a different collection path, or the field genuinely does not apply there. Checking how that segment is captured will separate the two, and the answer decides whether imputing within ${top.column} is safe or misleading.`,
    });
  } else {
    verdict = "MCAR";
    confidence = "supported";
    evidence.push({
      strength: "supported",
      text: `No column in this dataset predicts whether ${column} is missing at an effect size worth acting on. That is consistent with Missing Completely At Random, which is the most forgiving case for imputation.`,
    });
    evidence.push({
      strength: "hypothesis",
      text: `Consistent with is not the same as established. A test can only fail to find a pattern among the columns present here, so a driver that was never collected would look exactly like this.`,
    });
  }

  if (timing) {
    evidence.push({
      strength: "observed",
      text: `Missingness is not spread evenly over ${timing.column}: ${timing.beforeRate}% before ${timing.onset}, ${timing.afterRate}% from then on.`,
    });
    evidence.push({
      strength: "hypothesis",
      text: `A step change on a date points at the collection process rather than the subject matter: a pipeline change, a form edit, a renamed field, or a migration around ${timing.onset}. Worth confirming against a deploy or release log before treating the gap as real.`,
    });
  }

  // MNAR is unfalsifiable from observed data, so it is always raised and never
  // concluded. Saying so out loud is the honest position.
  if (!everythingMissing) {
    evidence.push({
      strength: "hypothesis",
      text: `Neither test above can rule out MNAR (Missing Not At Random), where values go missing because of what they would have been. High earners skipping an income field looks identical in the data to a random gap. Only knowledge of how ${column} is captured can settle it, and if it holds, imputation will bias the result rather than repair it.`,
    });
  }

  return {
    column,
    missingCount,
    missingPct,
    verdict,
    confidence,
    evidence,
    associations,
    timing,
    questions: buildQuestions(column, associations, timing),
  };
}

/** Prompts that hand the AI analyst a real question about this column. */
function buildQuestions(
  column: string,
  associations: MissingnessAssociation[],
  timing: TimeConcentration | null
): string[] {
  const questions = [
    `Compare rows where ${column} is missing against rows where it is present. Which columns differ most, and by how much?`,
  ];

  const top = associations[0];
  if (top) {
    questions.push(
      `Missing ${column} is concentrated in ${top.column} = ${top.segment}. Is that segment different in other ways, or only in this gap?`,
      `If I drop every row missing ${column}, how far does that shift the overall picture by ${top.column}?`
    );
  } else {
    questions.push(
      `Is there anything at all that separates rows missing ${column} from the rest, including combinations of columns?`
    );
  }

  if (timing) {
    questions.push(
      `Missing ${column} jumps around ${timing.onset} in ${timing.column}. Show the rate by month so I can see the shape of the change.`
    );
  }

  questions.push(
    `What would filling ${column} with its median do to its distribution, and would you recommend it here?`
  );

  return questions;
}
