/* Schema fingerprints: recognizing that this month's export is another copy of
 * a file Nexora has already cleaned.
 *
 * A recipe is only worth recording if something later knows when to replay it.
 * Real exports rename their own headers between periods — `Order Date` becomes
 * `order_date`, a column appears, one stops arriving — so matching on the exact
 * header list would fail on precisely the files this is for. Matching on
 * normalized names plus inferred types survives that drift and still refuses
 * an unrelated file. */

import type { CleanOp, ColumnType, Dataset } from "./types";

export interface DatasetFingerprint {
  version: 1;
  /** normalized column names, sorted, so column order cannot affect a match */
  columns: string[];
  /** normalized name -> inferred type */
  types: Record<string, ColumnType>;
  /** normalized name -> the header as it actually appears in the file, so every
   *  column a match reports can be shown the way the reader will see it */
  labels: Record<string, string>;
}

/** Fold away the separator and casing churn that the same export drifts through
 *  between periods, so `Order Date`, `order_date`, and `ORDER-DATE` are one name.
 *  A name made entirely of punctuation is left as-is rather than collapsed to
 *  the empty string, which would make every such column look identical. */
export function normalizeColumnName(name: string): string {
  const folded = name
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return folded.length > 0 ? folded : name.trim();
}

export function fingerprintDataset(dataset: Dataset): DatasetFingerprint {
  const types: Record<string, ColumnType> = Object.create(null);
  const labels: Record<string, string> = Object.create(null);
  for (const profile of dataset.profiles) {
    const key = normalizeColumnName(profile.name);
    types[key] = profile.type;
    labels[key] = profile.name;
  }
  return { version: 1, columns: Object.keys(types).sort(), types, labels };
}

export interface FingerprintMatch {
  /** 0-100 confidence that these two files are the same recurring export */
  score: number;
  /** normalized names present in both, the identities the set logic runs on */
  shared: string[];
  /** columns the candidate has and the known file did not, as the candidate labels them */
  added: string[];
  /** columns the known file had and the candidate does not, as the known file labelled them */
  missing: string[];
  /** shared columns whose inferred type changed, as the candidate labels them */
  retyped: { column: string; from: ColumnType; to: ColumnType }[];
}

/** Below this, treat the files as unrelated and offer nothing. Set so that a
 *  file sharing every header but agreeing on no type still fails: identical
 *  headers are not evidence when the content underneath them is different. */
export const RECURRING_MATCH_THRESHOLD = 70;

/** Weight of name overlap that type agreement cannot take away. The remainder
 *  is earned by the types matching. */
const NAME_WEIGHT = 0.65;

export function compareFingerprints(
  known: DatasetFingerprint,
  candidate: DatasetFingerprint
): FingerprintMatch {
  const knownSet = new Set(known.columns);
  const candidateSet = new Set(candidate.columns);

  const shared = known.columns.filter((c) => candidateSet.has(c));
  const missing = known.columns
    .filter((c) => !candidateSet.has(c))
    .map((c) => known.labels[c] ?? c);
  const added = candidate.columns
    .filter((c) => !knownSet.has(c))
    .map((c) => candidate.labels[c] ?? c);

  const retyped: FingerprintMatch["retyped"] = [];
  for (const column of shared) {
    const from = known.types[column];
    const to = candidate.types[column];
    if (from !== to) {
      retyped.push({ column: candidate.labels[column] ?? column, from, to });
    }
  }

  const unionSize = knownSet.size + added.length;
  if (unionSize === 0 || shared.length === 0) {
    return { score: 0, shared, added, missing, retyped };
  }

  const nameOverlap = shared.length / unionSize;
  const typeAgreement = 1 - retyped.length / shared.length;
  const score = Math.round(100 * nameOverlap * (NAME_WEIGHT + (1 - NAME_WEIGHT) * typeAgreement));

  return { score, shared, added, missing, retyped };
}

export function isRecurringMatch(match: FingerprintMatch): boolean {
  return match.score >= RECURRING_MATCH_THRESHOLD;
}

export interface RecurringSource {
  /** the earlier dataset whose recipe should be replayed */
  dataset: Dataset;
  match: FingerprintMatch;
}

/** The columns a recipe deletes by itself. The stored source is always the
 *  cleaned file while the one just imported is still raw, so a candidate that
 *  still carries the leftover index column is exactly what a recipe expects to
 *  find. Counting those as drift penalizes the match for the very mess it is
 *  there to remove, which is enough on its own to push a genuine repeat below
 *  the threshold. */
function droppedByRecipe(ops: CleanOp[]): Set<string> {
  const dropped = new Set<string>();
  for (const op of ops) {
    if (op.kind === "dropColumn") dropped.add(normalizeColumnName(op.column));
  }
  return dropped;
}

function omitColumns(print: DatasetFingerprint, drop: Set<string>): DatasetFingerprint {
  if (drop.size === 0) return print;

  const types: Record<string, ColumnType> = Object.create(null);
  const labels: Record<string, string> = Object.create(null);
  const columns = print.columns.filter((c) => !drop.has(c));
  for (const column of columns) {
    types[column] = print.types[column];
    labels[column] = print.labels[column];
  }
  return { version: 1, columns, types, labels };
}

/** Find the loaded dataset that this one is a later copy of, considering only
 *  candidates that carry a recipe: without one there is nothing to replay and
 *  so nothing to offer the reader. Highest score wins, most recent breaks a tie. */
export function findRecurringSource(target: Dataset, all: Dataset[]): RecurringSource | null {
  const targetPrint = fingerprintDataset(target);
  let best: RecurringSource | null = null;

  for (const candidate of all) {
    if (candidate.id === target.id) continue;
    if (!candidate.recipe || candidate.recipe.length === 0) continue;

    const match = compareFingerprints(
      fingerprintDataset(candidate),
      omitColumns(targetPrint, droppedByRecipe(candidate.recipe))
    );
    if (!isRecurringMatch(match)) continue;

    const better =
      best === null ||
      match.score > best.match.score ||
      (match.score === best.match.score && candidate.updatedAt > best.dataset.updatedAt);

    if (better) best = { dataset: candidate, match };
  }

  return best;
}
