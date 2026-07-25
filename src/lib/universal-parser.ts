import * as XLSX from "xlsx";
import type { Row } from "./types";
import { MAX_FILE_BYTES, ROW_CAP } from "./csv";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function setCell(row: Row, key: string, value: unknown) {
  const cell =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? value
      : null;
  Object.defineProperty(row, key, { value: cell, enumerable: true, writable: true, configurable: true });
}

function createRow(): Row {
  return Object.create(null) as Row;
}

export function flattenObject(obj: JsonValue, prefix = "", depth = 1): Record<string, JsonValue> {
  if (depth > 3 || !obj || typeof obj !== "object") {
    return { [prefix.slice(0, -1)]: obj };
  }
  const out: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const [k, val] of Object.entries(obj)) {
      const newKey = `${prefix}${k}_`;
      if (val && typeof val === "object" && !Array.isArray(val)) {
        for (const [nestedKey, nestedValue] of Object.entries(flattenObject(val, newKey, depth + 1))) {
          Object.defineProperty(out, nestedKey, { value: nestedValue, enumerable: true, writable: true, configurable: true });
        }
      } else {
        Object.defineProperty(out, `${prefix}${k}`, { value: val, enumerable: true, writable: true, configurable: true });
      }
  }
  return out;
}

export function parseJsonContent(text: string): { columns: string[]; rows: Row[]; truncated: boolean } {
  if (new Blob([text]).size > MAX_FILE_BYTES) {
    throw new Error("File exceeds the 25 MB limit.");
  }

  const parsed: JsonValue = JSON.parse(text);
  const rawRows = Array.isArray(parsed) ? parsed : [parsed];
  if (rawRows.length === 0) throw new Error("The JSON file contains no records.");

  const truncated = rawRows.length > ROW_CAP;
  const limitedRows = truncated ? rawRows.slice(0, ROW_CAP) : rawRows;
  const flattenedRows = limitedRows.map((row) => flattenObject(row));
  
  const columnsSet = new Set<string>();
  flattenedRows.forEach(row => {
    Object.keys(row).forEach(k => columnsSet.add(k));
  });
  
  const columns = Array.from(columnsSet);
  const rows: Row[] = flattenedRows.map((r) => {
    const row = createRow();
    columns.forEach(col => {
      const val = r[col];
      setCell(row, col, val === undefined || val === "" ? null : val);
    });
    return row;
  });

  if (columns.length === 0) throw new Error("No fields were found in the JSON records.");
  return { columns, rows, truncated };
}

export function parseExcelWorkbook(buffer: ArrayBuffer): { sheets: string[]; workbook: XLSX.WorkBook } {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error("File exceeds the 25 MB limit.");
  }
  const workbook = XLSX.read(buffer, { type: "array" });
  return { sheets: workbook.SheetNames, workbook };
}

export function parseExcelSheet(workbook: XLSX.WorkBook, sheetName: string): { columns: string[]; rows: Row[] } {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Worksheet ${sheetName} not found`);
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", range: 0 });
  if (rawData.length > ROW_CAP) {
    throw new Error(`Worksheet exceeds the ${ROW_CAP.toLocaleString()} row limit.`);
  }

  const columnsSet = new Set<string>();
  rawData.forEach(row => {
    Object.keys(row).forEach(k => columnsSet.add(k));
  });

  const columns = Array.from(columnsSet);
  const rows: Row[] = rawData.map((r) => {
    const row = createRow();
    columns.forEach(col => {
      const val = r[col];
      setCell(row, col, val === undefined || val === "" ? null : val);
    });
    return row;
  });

  return { columns, rows };
}
