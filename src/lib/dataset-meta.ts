/* Small descriptive helpers for the dataset picker: what kind of file this was,
 * when it arrived, and how big it is. Kept out of components so the strings are
 * consistent everywhere a dataset is listed. */

import type { Dataset } from "./types";

export interface FileType {
  /** short badge text, e.g. "CSV" */
  label: string;
  /** one line for tooltips and screen readers */
  description: string;
}

const EXTENSIONS: Record<string, FileType> = {
  csv: { label: "CSV", description: "Comma-separated values" },
  tsv: { label: "TSV", description: "Tab-separated values" },
  txt: { label: "Text", description: "Delimited text file" },
  json: { label: "JSON", description: "JSON records" },
  xlsx: { label: "Excel", description: "Excel workbook" },
  xls: { label: "Excel", description: "Excel workbook (legacy)" },
  xlsm: { label: "Excel", description: "Excel workbook with macros" },
  pdf: { label: "PDF", description: "Table extracted from a PDF" },
  png: { label: "Scan", description: "Table extracted from an image" },
  jpg: { label: "Scan", description: "Table extracted from an image" },
  jpeg: { label: "Scan", description: "Table extracted from an image" },
};

/** What kind of source a dataset came from, read from its name. Datasets Nexora
 *  produced itself (joins, SQL results, database pulls) carry no extension, so
 *  they are named for what made them instead of being mislabelled as a file. */
export function fileTypeOf(name: string): FileType {
  const lower = name.toLowerCase();
  if (lower.startsWith("query:") || lower.includes("_result")) {
    return { label: "Query", description: "Result of a SQL query" };
  }
  if (lower.includes(" + ") || lower.includes("_join")) {
    return { label: "Join", description: "Built by joining two datasets" };
  }
  const ext = lower.split(".").pop() ?? "";
  return EXTENSIONS[ext] ?? { label: "Table", description: "Table loaded into the workspace" };
}

/** "12 Jun 2026, 14:32" — unambiguous, and never a relative string that goes
 *  stale while the tab is open. */
export function formatStamp(at: number): string {
  return new Date(at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 days ago", for the at-a-glance column next to the exact stamp. */
export function relativeTime(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/** A short line describing the shape and condition of a dataset. */
export function describeDataset(ds: Dataset): string {
  const issues = ds.diagnostics.length;
  return `${ds.rows.length.toLocaleString("en-US")} rows · ${ds.columns.length} columns · health ${ds.health.overall}%${
    issues > 0 ? ` · ${issues} issue${issues === 1 ? "" : "s"}` : ""
  }`;
}

/** True when the dataset has been changed since it was imported, which is what
 *  makes "last modified" worth showing separately from "uploaded". */
export function wasModified(ds: Dataset): boolean {
  return ds.updatedAt - ds.createdAt > 1000 || (ds.recipe?.length ?? 0) > 0;
}
