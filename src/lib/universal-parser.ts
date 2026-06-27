import * as XLSX from "xlsx";
import type { Row } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic JSON/sheet rows are genuinely untyped */
export function flattenObject(obj: any, prefix = "", depth = 1): Record<string, any> {
  if (depth > 3 || !obj || typeof obj !== "object") {
    return { [prefix.slice(0, -1)]: obj };
  }
  const out: Record<string, any> = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const val = obj[k];
      const newKey = `${prefix}${k}_`;
      if (val && typeof val === "object" && !Array.isArray(val)) {
        Object.assign(out, flattenObject(val, newKey, depth + 1));
      } else {
        out[`${prefix}${k}`] = val;
      }
    }
  }
  return out;
}

export function parseJsonContent(text: string): { columns: string[]; rows: Row[] } {
  const parsed = JSON.parse(text);
  const rawRows = Array.isArray(parsed) ? parsed : [parsed];
  const flattenedRows = rawRows.map(r => flattenObject(r));
  
  const columnsSet = new Set<string>();
  flattenedRows.forEach(row => {
    Object.keys(row).forEach(k => columnsSet.add(k));
  });
  
  const columns = Array.from(columnsSet);
  const rows: Row[] = flattenedRows.map(r => {
    const row: Row = {};
    columns.forEach(col => {
      const val = r[col];
      row[col] = val === undefined || val === "" ? null : val;
    });
    return row;
  });

  return { columns, rows };
}

export function parseExcelWorkbook(buffer: ArrayBuffer): { sheets: string[]; workbook: XLSX.WorkBook } {
  const workbook = XLSX.read(buffer, { type: "array" });
  return { sheets: workbook.SheetNames, workbook };
}

export function parseExcelSheet(workbook: XLSX.WorkBook, sheetName: string): { columns: string[]; rows: Row[] } {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Worksheet ${sheetName} not found`);
  const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

  const columnsSet = new Set<string>();
  rawData.forEach(row => {
    Object.keys(row).forEach(k => columnsSet.add(k));
  });

  const columns = Array.from(columnsSet);
  const rows: Row[] = rawData.map(r => {
    const row: Row = {};
    columns.forEach(col => {
      const val = r[col];
      row[col] = val === undefined || val === "" ? null : val;
    });
    return row;
  });

  return { columns, rows };
}
