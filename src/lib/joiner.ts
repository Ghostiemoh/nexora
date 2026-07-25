import type { Row, CellValue } from "./types";

/** Normalised join key. Returns null for empty keys so that NULL never joins to
 *  NULL (matching SQL semantics). */
function keyOf(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  return s === "" ? null : s;
}

export function joinDatasets(
  leftRows: Row[],
  leftCols: string[],
  rightRows: Row[],
  rightCols: string[],
  leftKey: string,
  rightKey: string,
  joinType: "inner" | "left" | "right" | "full"
): { columns: string[]; rows: Row[] } {
  const columnsSet = new Set<string>();
  const collidingCols = leftCols.filter((c) => rightCols.includes(c) && c !== leftKey && c !== rightKey);

  const leftColMap: Record<string, string> = {};
  const rightColMap: Record<string, string> = {};

  leftCols.forEach((c) => {
    leftColMap[c] = collidingCols.includes(c) ? `${c}_left` : c;
    columnsSet.add(leftColMap[c]);
  });

  rightCols.forEach((c) => {
    if (collidingCols.includes(c)) {
      rightColMap[c] = `${c}_right`;
      columnsSet.add(`${c}_right`);
    } else if (c !== rightKey) {
      rightColMap[c] = c;
      columnsSet.add(c);
    }
  });

  const outputCols = Array.from(columnsSet);
  const results: Row[] = [];

  const pad = (row: Row): Row => {
    outputCols.forEach((col) => {
      if (row[col] === undefined) row[col] = null;
    });
    return row;
  };

  const mergeMatched = (leftRow: Row, rightRow: Row): Row => {
    const merged: Row = {};
    leftCols.forEach((c) => (merged[leftColMap[c]] = leftRow[c]));
    rightCols.forEach((c) => {
      if (c !== rightKey) merged[rightColMap[c]] = rightRow[c];
    });
    return pad(merged);
  };

  const leftOnly = (leftRow: Row): Row => {
    const merged: Row = {};
    leftCols.forEach((c) => (merged[leftColMap[c]] = leftRow[c]));
    return pad(merged);
  };

  const rightOnly = (rightRow: Row): Row => {
    const merged: Row = {};
    rightCols.forEach((c) => {
      if (c === rightKey) merged[leftKey] = rightRow[c];
      else merged[rightColMap[c]] = rightRow[c];
    });
    return pad(merged);
  };

  // Index right rows by key (skipping null keys, which never join).
  const rightIndex = new Map<string, number[]>();
  rightRows.forEach((r, idx) => {
    const key = keyOf(r[rightKey]);
    if (key === null) return;
    const arr = rightIndex.get(key);
    if (arr) arr.push(idx);
    else rightIndex.set(key, [idx]);
  });

  const matchedRight = new Set<number>();

  leftRows.forEach((leftRow) => {
    const key = keyOf(leftRow[leftKey]);
    const matches = key !== null ? rightIndex.get(key) : undefined;

    if (matches && matches.length > 0) {
      matches.forEach((idx) => {
        matchedRight.add(idx);
        results.push(mergeMatched(leftRow, rightRows[idx]));
      });
    } else if (joinType === "left" || joinType === "full") {
      results.push(leftOnly(leftRow));
    }
  });

  if (joinType === "right" || joinType === "full") {
    rightRows.forEach((rightRow, idx) => {
      if (!matchedRight.has(idx)) results.push(rightOnly(rightRow));
    });
  }

  return { columns: outputCols, rows: results };
}
