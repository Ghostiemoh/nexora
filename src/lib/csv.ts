import Papa from "papaparse";
import type { Row } from "./types";

export const ROW_CAP = 50_000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ParsedCsv {
  columns: string[];
  rows: Row[];
  truncated: boolean;
}

/** Parse a CSV/TSV file in the browser. Values stay raw strings;
 *  type coercion happens in the profiling engine. */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error("File exceeds the 25 MB limit."));
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      preview: ROW_CAP + 1,
      complete: (result) => {
        const fields = (result.meta.fields ?? []).filter((f) => f !== "");
        if (fields.length === 0) {
          reject(new Error("No header row found. The first line must contain column names."));
          return;
        }

        const truncated = result.data.length > ROW_CAP;
        const raw = truncated ? result.data.slice(0, ROW_CAP) : result.data;

        const rows: Row[] = raw.map((r) => {
          const row: Row = {};
          for (const f of fields) {
            const v = r[f];
            row[f] = v === undefined || v === "" ? null : v;
          }
          return row;
        });

        if (rows.length === 0) {
          reject(new Error("The file has headers but no data rows."));
          return;
        }

        resolve({ columns: fields, rows, truncated });
      },
      error: (err) => reject(new Error(`Parse failed: ${err.message}`)),
    });
  });
}

/** Serialize rows back to CSV for export. */
export function toCsv(columns: string[], rows: Row[]): string {
  return Papa.unparse(
    rows.map((r) => {
      const out: Record<string, CellExport> = {};
      for (const c of columns) out[c] = r[c] === null ? "" : (r[c] as CellExport);
      return out;
    }),
    { columns }
  );
}

type CellExport = string | number | boolean;

export function downloadCsv(filename: string, columns: string[], rows: Row[]) {
  const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
