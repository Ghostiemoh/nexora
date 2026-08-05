/* Cell-level error location.
 *
 * The Findings list tells you a column has a problem. This tells you the
 * problem is in C42. Every issue resolves to a sheet, a column, a row number,
 * and a spreadsheet-style reference, because that is the vocabulary an analyst
 * already uses to talk about a broken file.
 *
 * The findings and the cells are derived from the same profile, so the two
 * views can never disagree about what is wrong. Pure logic, no UI. */

import type { CellValue, CleanOp, ColumnProfile, Dataset, Row } from "./types";
import { parseNumeric, iqrFences } from "./number";
import { parseStrictDate } from "./profile";
import { MOJIBAKE_RE, isExcelDateSerial, titleCase } from "./clean";

export type CellIssueRule =
  | "missing"
  | "typeMismatch"
  | "outlier"
  | "whitespace"
  | "encoding"
  | "casing"
  | "variant"
  | "excelSerial";

export interface CellIssue {
  id: string;
  /** worksheet the import came from, when the file carried one */
  sheet: string | null;
  column: string;
  /** index into dataset.rows */
  rowIndex: number;
  /** row number as a spreadsheet shows it, header counted as row 1 */
  row: number;
  /** A1-style reference, e.g. "C42" */
  ref: string;
  rule: CellIssueRule;
  /** the finding this cell belongs to, so skipping the rule hides its cells */
  diagnosticId: string;
  /** short human name for the error type */
  label: string;
  /** what is wrong with this specific cell */
  detail: string;
  value: CellValue;
  /** what the value becomes if the fix is applied, when that is knowable */
  proposed?: CellValue;
  /** the column-scoped operation that resolves it */
  fix?: { op: CleanOp; label: string; manual?: boolean };
  /** true when the remedy is a judgement call, never applied in bulk */
  manual?: boolean;
}

export interface CellIssueReport {
  issues: CellIssue[];
  /** every issue found, including those beyond the returned cap */
  total: number;
  countsByRule: Record<CellIssueRule, number>;
  /** true when `issues` was capped */
  truncated: boolean;
}

/** Scanning is capped so a million-cell file cannot lock the tab. */
const DEFAULT_LIMIT = 500;

export const RULE_LABELS: Record<CellIssueRule, string> = {
  missing: "Missing value",
  typeMismatch: "Type mismatch",
  outlier: "Outlier",
  whitespace: "Stray whitespace",
  encoding: "Broken encoding",
  casing: "Inconsistent casing",
  variant: "Value variant",
  excelSerial: "Excel serial date",
};

/** Spreadsheet column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let out = "";
  let n = index;
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

/** A1-style cell reference. `rowIndex` is zero-based over data rows; the header
 *  occupies row 1, so the first data row is row 2. */
export function cellRef(columnIndex: number, rowIndex: number): string {
  return `${columnLetter(columnIndex)}${rowIndex + 2}`;
}

/** The worksheet a dataset came from. The Excel importer names datasets
 *  "book.xlsx (Sheet1)", so the sheet is recoverable without a schema change. */
export function sheetNameOf(datasetName: string): string | null {
  const match = /\(([^()]+)\)\s*$/.exec(datasetName.trim());
  return match ? match[1] : null;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function hasWhitespaceNoise(v: string): boolean {
  return v.trim() !== v || /\s{2,}/.test(v);
}

function caseStyle(s: string): "lower" | "upper" | "mixed" | "other" {
  if (!/^[a-zA-Z]/.test(s)) return "other";
  if (s === s.toLowerCase()) return "lower";
  if (s === s.toUpperCase()) return "upper";
  return "mixed";
}

/** True when a value disagrees with the type its column was inferred to hold. */
function violatesType(value: CellValue, profile: ColumnProfile): boolean {
  if (profile.type === "number") return parseNumeric(value) === null;
  if (profile.type === "boolean") {
    const s = String(value).trim().toLowerCase();
    return s !== "true" && s !== "false";
  }
  if (profile.type === "date") {
    if (parseStrictDate(value) !== null) return false;
    const n = parseNumeric(value);
    return !(n !== null && isExcelDateSerial(n));
  }
  return false;
}

/** The value → replacement map a merge fix would apply, read back off the
 *  diagnostic so the cell view proposes exactly what the fix does. */
function mergeMappingFor(ds: Dataset, column: string): Record<string, string> | null {
  const diag = ds.diagnostics.find((d) => d.id === `diag_merge_${column}`);
  if (diag?.fix?.op.kind === "mergeValues") return diag.fix.op.mapping;
  return null;
}

/** True when this column's casing is inconsistent enough that the profiler
 *  raised a finding for it. */
function hasCasingFinding(ds: Dataset, column: string): boolean {
  return ds.diagnostics.some((d) => d.id === `diag_case_${column}`);
}

export interface CellIssueOptions {
  /** maximum issues to return; the counts stay complete either way */
  limit?: number;
  /** rules and diagnostic ids the analyst marked intentional */
  skipped?: readonly string[];
  /** narrow the scan to one column */
  column?: string | null;
  /** narrow the scan to one rule */
  rule?: CellIssueRule | null;
}

/** Locate every problem cell in a dataset, newest profile first. */
export function buildCellIssues(ds: Dataset, options: CellIssueOptions = {}): CellIssueReport {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const skipped = new Set(options.skipped ?? []);
  const sheet = sheetNameOf(ds.name);

  const issues: CellIssue[] = [];
  const countsByRule: Record<CellIssueRule, number> = {
    missing: 0,
    typeMismatch: 0,
    outlier: 0,
    whitespace: 0,
    encoding: 0,
    casing: 0,
    variant: 0,
    excelSerial: 0,
  };
  let total = 0;

  const push = (issue: CellIssue) => {
    if (skipped.has(issue.diagnosticId) || skipped.has(issue.rule)) return;
    if (options.rule && issue.rule !== options.rule) return;
    countsByRule[issue.rule]++;
    total++;
    if (issues.length < limit) issues.push(issue);
  };

  const columns = options.column ? ds.columns.filter((c) => c === options.column) : ds.columns;

  for (const column of columns) {
    const columnIndex = ds.columns.indexOf(column);
    const profile = ds.profiles.find((p) => p.name === column);
    if (!profile) continue;

    // Per-column context computed once, not per cell.
    const fences =
      profile.type === "number"
        ? iqrFences(
            ds.rows
              .map((r) => parseNumeric(r[column]))
              .filter((n): n is number => n !== null)
              .sort((a, b) => a - b)
          )
        : null;
    const mergeMapping = mergeMappingFor(ds, column);
    const casingColumn = hasCasingFinding(ds, column);
    const serialDateColumn = ds.diagnostics.some((d) => d.id === `diag_exceldate_${column}`);
    const fillStrategy = profile.type === "number" ? "median" : "mode";

    for (let rowIndex = 0; rowIndex < ds.rows.length; rowIndex++) {
      const value = ds.rows[rowIndex][column] ?? null;
      const ref = cellRef(columnIndex, rowIndex);
      const base = { sheet, column, rowIndex, row: rowIndex + 2, ref, value };

      if (isEmpty(value)) {
        push({
          ...base,
          id: `ci_missing_${column}_${rowIndex}`,
          rule: "missing",
          diagnosticId: `diag_missing_${column}`,
          label: RULE_LABELS.missing,
          detail: `${column} is empty on row ${rowIndex + 2}.`,
          fix: {
            op: { kind: "fillMissing", column, strategy: fillStrategy },
            label: `Impute via ${fillStrategy}`,
          },
        });
        // An empty cell has no other problems worth reporting.
        continue;
      }

      const text = typeof value === "string" ? value : null;

      if (serialDateColumn) {
        const n = parseNumeric(value);
        if (n !== null && isExcelDateSerial(n)) {
          push({
            ...base,
            id: `ci_serial_${column}_${rowIndex}`,
            rule: "excelSerial",
            diagnosticId: `diag_exceldate_${column}`,
            label: RULE_LABELS.excelSerial,
            detail: `${n} is an Excel day number, not a date.`,
            proposed: new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10),
            fix: { op: { kind: "convertExcelDates", column }, label: "Convert to dates" },
          });
        }
      } else if (violatesType(value, profile)) {
        push({
          ...base,
          id: `ci_type_${column}_${rowIndex}`,
          rule: "typeMismatch",
          diagnosticId: `diag_type_${column}`,
          label: RULE_LABELS.typeMismatch,
          detail: `"${String(value)}" is not a valid ${profile.type} in a ${profile.type} column.`,
          manual: true,
        });
      }

      if (fences && profile.type === "number") {
        const n = parseNumeric(value);
        if (n !== null && (n < fences.lo || n > fences.hi)) {
          push({
            ...base,
            id: `ci_outlier_${column}_${rowIndex}`,
            rule: "outlier",
            diagnosticId: `diag_outliers_${column}`,
            label: RULE_LABELS.outlier,
            detail: `${n} sits outside the expected range [${fences.lo} … ${fences.hi}].`,
            proposed: n < fences.lo ? fences.lo : fences.hi,
            fix: { op: { kind: "capOutliers", column }, label: "Cap at fence", manual: true },
            manual: true,
          });
        }
      }

      if (text !== null) {
        if (MOJIBAKE_RE.test(text)) {
          push({
            ...base,
            id: `ci_encoding_${column}_${rowIndex}`,
            rule: "encoding",
            diagnosticId: "diag_encoding",
            label: RULE_LABELS.encoding,
            detail: `"${text}" carries characters from a bad charset conversion.`,
            fix: { op: { kind: "fixEncoding" }, label: "Repair encoding" },
          });
        }

        if (hasWhitespaceNoise(text)) {
          push({
            ...base,
            id: `ci_space_${column}_${rowIndex}`,
            rule: "whitespace",
            diagnosticId: "diag_whitespace",
            label: RULE_LABELS.whitespace,
            detail:
              text.trim() !== text
                ? "Leading or trailing spaces."
                : "Doubled-up spaces inside the value.",
            proposed: text.trim().replace(/\s{2,}/g, " "),
            fix: { op: { kind: "trimWhitespace" }, label: "Normalize spacing" },
          });
        }

        if (casingColumn) {
          const t = text.trim();
          const style = caseStyle(t);
          if (t !== "" && (style === "lower" || style === "upper")) {
            push({
              ...base,
              id: `ci_case_${column}_${rowIndex}`,
              rule: "casing",
              diagnosticId: `diag_case_${column}`,
              label: RULE_LABELS.casing,
              detail: `"${t}" is ${style === "lower" ? "all lower case" : "ALL CAPS"} where the column is mostly Mixed Case.`,
              proposed: titleCase(text),
              fix: { op: { kind: "standardizeCase", column }, label: "Standardize casing" },
            });
          }
        }

        if (mergeMapping) {
          const target = mergeMapping[text.trim()];
          if (target !== undefined) {
            push({
              ...base,
              id: `ci_variant_${column}_${rowIndex}`,
              rule: "variant",
              diagnosticId: `diag_merge_${column}`,
              label: RULE_LABELS.variant,
              detail: `"${text.trim()}" looks like a variant of "${target}".`,
              proposed: target,
              fix: {
                op: { kind: "mergeValues", column, mapping: mergeMapping },
                label: "Merge variants",
              },
            });
          }
        }
      }
    }
  }

  // Read order: down the rows, then across the columns, the way you would scan
  // the sheet itself.
  issues.sort((a, b) => a.rowIndex - b.rowIndex || a.column.localeCompare(b.column));

  return { issues, total, countsByRule, truncated: total > issues.length };
}

/** Row indexes that repeat an earlier row exactly. Reported separately because
 *  a duplicate is a property of the row, not of any one cell. */
export function duplicateRowIndexes(rows: Row[]): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  rows.forEach((row, index) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) out.push(index);
    else seen.add(key);
  });
  return out;
}
