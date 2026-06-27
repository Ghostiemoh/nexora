import type { Row } from "./types";

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
  const collidingCols = leftCols.filter(c => rightCols.includes(c) && c !== leftKey && c !== rightKey);

  const leftColMap: Record<string, string> = {};
  const rightColMap: Record<string, string> = {};

  leftCols.forEach(c => {
    if (collidingCols.includes(c)) {
      leftColMap[c] = `${c}_left`;
      columnsSet.add(`${c}_left`);
    } else {
      leftColMap[c] = c;
      columnsSet.add(c);
    }
  });

  rightCols.forEach(c => {
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

  const rightMap = new Map<string, Row[]>();
  rightRows.forEach(r => {
    const val = String(r[rightKey] ?? "").trim().toLowerCase();
    const arr = rightMap.get(val) || [];
    arr.push(r);
    rightMap.set(val, arr);
  });

  const matchedRightIndices = new Set<number>();

  leftRows.forEach(leftRow => {
    const val = String(leftRow[leftKey] ?? "").trim().toLowerCase();
    const matches = rightMap.get(val);

    if (matches && matches.length > 0) {
      matches.forEach(rightRow => {
        const idx = rightRows.indexOf(rightRow);
        if (idx !== -1) matchedRightIndices.add(idx);

        const merged: Row = {};
        leftCols.forEach(c => {
          merged[leftColMap[c]] = leftRow[c];
        });
        rightCols.forEach(c => {
          if (c !== rightKey) {
            merged[rightColMap[c]] = rightRow[c];
          }
        });
        outputCols.forEach(col => {
          if (merged[col] === undefined) merged[col] = null;
        });
        results.push(merged);
      });
    } else {
      if (joinType === "left" || joinType === "full") {
        const merged: Row = {};
        leftCols.forEach(c => {
          merged[leftColMap[c]] = leftRow[c];
        });
        outputCols.forEach(col => {
          if (merged[col] === undefined) merged[col] = null;
        });
        results.push(merged);
      }
    }
  });

  if (joinType === "right" || joinType === "full") {
    rightRows.forEach((rightRow, idx) => {
      if (!matchedRightIndices.has(idx)) {
        const merged: Row = {};
        rightCols.forEach(c => {
          if (c === rightKey) {
            merged[leftKey] = rightRow[c];
          } else {
            merged[rightColMap[c]] = rightRow[c];
          }
        });
        outputCols.forEach(col => {
          if (merged[col] === undefined) merged[col] = null;
        });
        results.push(merged);
      }
    });
  }

  return { columns: outputCols, rows: results };
}
