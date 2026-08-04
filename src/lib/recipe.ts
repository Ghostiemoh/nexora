/* Cleaning recipes: a dataset's applied ops recorded as portable JSON, so the
 * same cleanup replays in one click on next month's export of the same file.
 * Also: dry-run previews so every fix shows its blast radius before applying. */

import type { Row, CleanOp } from "./types";
import { applyCleanOp } from "./clean";

export interface Recipe {
  version: 1;
  /** dataset name the recipe was recorded from (informational) */
  source: string;
  createdAt: string;
  ops: CleanOp[];
}

export function buildRecipe(source: string, ops: CleanOp[]): Recipe {
  return { version: 1, source, createdAt: new Date().toISOString(), ops };
}

export function serializeRecipe(recipe: Recipe): string {
  return JSON.stringify(recipe, null, 2);
}

const OP_KINDS = new Set([
  "dropDuplicates", "dropEmptyRows", "trimWhitespace", "fillMissing",
  "fixEncoding", "standardizeCase", "mergeValues", "convertExcelDates", "dropColumn",
  "findReplace", "splitColumn", "capOutliers", "dropOutlierRows",
]);

/** Parse and validate recipe JSON. Throws with a human-readable message. */
export function parseRecipe(json: string): Recipe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Not valid JSON.");
  }
  const r = parsed as Partial<Recipe>;
  if (r.version !== 1 || !Array.isArray(r.ops)) {
    throw new Error("Not a Nexora recipe file (missing version/ops).");
  }
  for (const op of r.ops) {
    if (!op || typeof op !== "object" || !OP_KINDS.has((op as CleanOp).kind)) {
      throw new Error(`Recipe contains an unknown operation: ${JSON.stringify(op)}`);
    }
  }
  return { version: 1, source: r.source ?? "unknown", createdAt: r.createdAt ?? "", ops: r.ops as CleanOp[] };
}

/** Apply every op in order. Ops referencing a missing column are skipped
 *  rather than fatal, so a recipe survives small schema drift between exports. */
export function replayRecipe(rows: Row[], columns: string[], ops: CleanOp[]): {
  rows: Row[];
  columns: string[];
  applied: number;
  skipped: number;
} {
  let outRows = rows;
  let outCols = [...columns];
  let applied = 0;
  let skipped = 0;

  for (const op of ops) {
    const needsColumn = "column" in op ? op.column : null;
    if (needsColumn !== null && !outCols.includes(needsColumn)) {
      skipped++;
      continue;
    }
    outRows = applyCleanOp(outRows, op);
    if (op.kind === "dropColumn") {
      outCols = outCols.filter((c) => c !== op.column);
    } else if (op.kind === "splitColumn" && outRows.length > 0) {
      // Splitting rewrites the schema, so take the new column order from the rows.
      outCols = Object.keys(outRows[0]);
    }
    applied++;
  }
  return { rows: outRows, columns: outCols, applied, skipped };
}

export interface OpPreview {
  /** cells whose value would change */
  changedCells: number;
  /** rows that would be removed */
  removedRows: number;
}

/** Dry-run an op and report its blast radius without mutating anything. */
export function previewCleanOp(rows: Row[], op: CleanOp): OpPreview {
  if (op.kind === "dropColumn") {
    return { changedCells: rows.length, removedRows: 0 };
  }

  const next = applyCleanOp(rows, op);
  if (next.length !== rows.length) {
    return { changedCells: 0, removedRows: rows.length - next.length };
  }

  let changedCells = 0;
  for (let i = 0; i < rows.length; i++) {
    const before = rows[i];
    const after = next[i];
    for (const key of Object.keys(before)) {
      if (before[key] !== after[key]) changedCells++;
    }
  }
  return { changedCells, removedRows: 0 };
}
