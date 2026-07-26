import * as XLSX from "xlsx";
import type { Dataset } from "./types";

/** Two-sheet workbook holding the cleaned data plus a cleaning audit trail.
 *  This is the client-ready deliverable. */
export function datasetToWorkbook(ds: Dataset): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const dataRows = ds.rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const c of ds.columns) out[c] = row[c];
    return out;
  });
  const dataSheet = XLSX.utils.json_to_sheet(dataRows, { header: ds.columns });
  XLSX.utils.book_append_sheet(wb, dataSheet, "Data");

  const audit: (string | number)[][] = [
    ["Nexora Cleaning Audit"],
    [],
    ["Dataset", ds.name],
    ["Rows", ds.rows.length],
    ["Columns", ds.columns.length],
    ["Health score", `${ds.health.overall}%`],
    ["Completeness", `${ds.health.completeness}%`],
    ["Accuracy", `${ds.health.accuracy}%`],
    ["Validity", `${ds.health.validity}%`],
    ["Consistency", `${ds.health.consistency}%`],
    ["Open diagnostics", ds.diagnostics.length],
    [],
    ["Audit trail"],
    ...ds.changelog.map((log, i) => [i + 1, log] as (string | number)[]),
  ];
  const auditSheet = XLSX.utils.aoa_to_sheet(audit);
  auditSheet["!cols"] = [{ wch: 18 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, auditSheet, "Audit");

  return wb;
}

export function downloadXlsx(ds: Dataset) {
  const base = ds.name.replace(/\.[^/.]+$/, "");
  XLSX.writeFile(datasetToWorkbook(ds), `${base}_cleaned.xlsx`);
}
