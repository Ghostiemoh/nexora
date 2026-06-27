import type { Row, CleanOp, CellValue } from "./types";

export function applyCleanOp(rows: Row[], op: CleanOp): Row[] {
  switch (op.kind) {
    case "dropDuplicates": {
      const seen = new Set<string>();
      return rows.filter((row) => {
        const rowStr = JSON.stringify(row);
        if (seen.has(rowStr)) return false;
        seen.add(rowStr);
        return true;
      });
    }
    
    case "dropEmptyRows": {
      return rows.filter((row) => {
        return !Object.values(row).every((v) => v === null || v === undefined || v === "");
      });
    }
    
    case "trimWhitespace": {
      return rows.map((row) => {
        const next: Row = {};
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === "string") {
            next[k] = v.trim();
          } else {
            next[k] = v;
          }
        }
        return next;
      });
    }
    
    case "fillMissing": {
      const { column, strategy } = op;
      const nonNullVals = rows
        .map((r) => r[column])
        .filter((v) => v !== null && v !== undefined && v !== "");
        
      if (nonNullVals.length === 0) return rows; // Nothing to fill
      
      let fillVal: CellValue = null;
      if (strategy === "median") {
        const numbers = nonNullVals.map((v) => Number(v)).filter((n) => !isNaN(n)).sort((a, b) => a - b);
        if (numbers.length > 0) {
          const mid = Math.floor(numbers.length / 2);
          fillVal = numbers.length % 2 !== 0 ? numbers[mid] : (numbers[mid - 1] + numbers[mid]) / 2;
        }
      } else {
        // Mode
        const frequencies: Record<string, number> = {};
        nonNullVals.forEach((v) => {
          const key = String(v);
          frequencies[key] = (frequencies[key] || 0) + 1;
        });
        const sorted = Object.entries(frequencies).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          const rawVal = sorted[0][0];
          // Try parse type if number or boolean
          if (rawVal === "true") fillVal = true;
          else if (rawVal === "false") fillVal = false;
          else if (!isNaN(Number(rawVal))) fillVal = Number(rawVal);
          else fillVal = rawVal;
        }
      }
      
      if (fillVal === null) return rows;
      
      return rows.map((row) => {
        if (row[column] === null || row[column] === undefined || row[column] === "") {
          return { ...row, [column]: fillVal };
        }
        return row;
      });
    }
    
    default:
      return rows;
  }
}
