import type { Dataset, Row, ColumnProfile, Diagnostic, DatasetHealth, ColumnType } from "./types";
import { parseNumeric, hasLeadingZeroId, isIdentifierName, isSequentialIndex } from "./number";
import { MOJIBAKE_RE, isExcelDateSerial, excelSerialToIso } from "./clean";

/** Strict date formats. We require a recognised shape *and* a parseable value so
 *  that stray words ("May", "March") are never mistaken for dates. */
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  /^\d{4}\/\d{1,2}\/\d{1,2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  /^\d{1,2}-\d{1,2}-\d{4}$/,
  /^\d{1,2}\.\d{1,2}\.\d{4}$/,
];

export function parseStrictDate(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const s = String(value).trim();
  if (!DATE_PATTERNS.some((re) => re.test(s))) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Column names that suggest the values are dates even when stored as numbers
 *  (Excel serials like 44391). */
const DATE_NAME_RE = /date|created|updated|modified|timestamp|birth|dob|expir/i;

function isBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  const s = String(value).trim().toLowerCase();
  return s === "true" || s === "false";
}

/** Linear-interpolation percentile (matches numpy/pandas default and Excel). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

const r2 = (n: number) => parseFloat(n.toFixed(2));

/** True when a cell is empty for profiling purposes (null, undefined, or blank/
 *  whitespace-only string). Whitespace-only cells count as missing. */
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Levenshtein distance capped at `cap` (early exit; enough for typo merging). */
export function boundedLevenshtein(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    prev = curr;
  }
  return prev[b.length];
}

const normalizeCategory = (s: string): string =>
  s.trim().toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s{2,}/g, " ");

/** Find likely typo/plural variants inside a low-cardinality column:
 *  rare values mapped onto the more frequent value they resemble. */
export function findMergeCandidates(counts: Map<string, number>): Record<string, string> {
  const mapping: Record<string, string> = {};
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [common, commonCount] = entries[i];
      const [rare, rareCount] = entries[j];
      if (commonCount < 2 || commonCount < rareCount * 2) continue;
      if (mapping[rare] !== undefined) continue;
      const a = normalizeCategory(common);
      const b = normalizeCategory(rare);
      const plural = a === `${b}s` || b === `${a}s`;
      const closeTypo = a.length >= 5 && b.length >= 5 && boundedLevenshtein(a, b, 2) <= 2;
      if (a === b || plural || closeTypo) {
        mapping[rare] = common;
      }
    }
  }
  return mapping;
}

/** Classify a value's letter-casing style for consistency checks. */
function caseStyle(s: string): "lower" | "upper" | "mixed" | "other" {
  if (!/^[a-zA-Z]/.test(s)) return "other";
  if (s === s.toLowerCase()) return "lower";
  if (s === s.toUpperCase()) return "upper";
  return "mixed";
}

export function profileDataset(raw: {
  id: string;
  name: string;
  columns: string[];
  rows: Row[];
  createdAt: number;
  changelog: string[];
  truncated?: boolean;
}): Dataset {
  const { id, name, columns, rows, createdAt, changelog, truncated = false } = raw;
  const rowCount = rows.length;

  // 1. Calculate duplicates
  let duplicateRows = 0;
  const seenRows = new Set<string>();
  rows.forEach((row) => {
    const rowStr = JSON.stringify(row);
    if (seenRows.has(rowStr)) {
      duplicateRows++;
    } else {
      seenRows.add(rowStr);
    }
  });

  // Accuracy contributions from numeric columns (share of in-fence values).
  const accuracyScores: number[] = [];

  // Column-level findings that feed diagnostics after the loop.
  const indexCols: string[] = [];
  const mojibakeCols: string[] = [];
  const casingCols: string[] = [];
  const excelDateCols: string[] = [];
  const mergeCols: { column: string; mapping: Record<string, string> }[] = [];
  const dupIdCols: string[] = [];

  // 2. Profile columns
  const profiles: ColumnProfile[] = columns.map((colName) => {
    const nonNullValues = rows.map((r) => r[colName]).filter((v) => !isEmpty(v));

    const nonNullCount = nonNullValues.length;
    const completeness = rowCount > 0 ? (nonNullCount / rowCount) * 100 : 100;

    // Uniqueness
    const uniqueValues = new Set(nonNullValues);
    const uniqueCount = uniqueValues.size;
    const uniqueness = nonNullCount > 0 ? (uniqueCount / nonNullCount) * 100 : 100;

    // Type Inference
    let inferredType: ColumnType = "string";
    let numericCount = 0;
    let booleanCount = 0;
    let dateCount = 0;
    let serialDateCount = 0;
    let hasWhitespace = false;
    let hasMojibake = false;
    let hasLeadingZero = false;

    nonNullValues.forEach((val) => {
      if (typeof val === "string") {
        if (val.trim() !== val || /\s{2,}/.test(val)) hasWhitespace = true;
        if (MOJIBAKE_RE.test(val)) hasMojibake = true;
      }
      if (hasLeadingZeroId(val)) hasLeadingZero = true;
      const num = parseNumeric(val);
      if (num !== null) {
        numericCount++;
        if (isExcelDateSerial(num)) serialDateCount++;
      }
      if (isBooleanLike(val)) booleanCount++;
      if (parseStrictDate(val) !== null) dateCount++;
    });

    const nameIsId = isIdentifierName(colName);
    const threshold = nonNullCount * 0.9;

    // Row-index detection is independent of inferred type: "S.No." and
    // "__EMPTY" are identifier-named (so never typed number) yet still indexes.
    let isIndexCol = false;
    if (nonNullCount > 0 && numericCount === nonNullCount) {
      const nums = nonNullValues
        .map((v) => parseNumeric(v))
        .filter((n): n is number => n !== null);
      isIndexCol = isSequentialIndex(nums);
      if (isIndexCol) indexCols.push(colName);
    }
    // Numbers that are Excel date serials in a date-named column are dates.
    const isSerialDateCol =
      nonNullCount > 0 &&
      DATE_NAME_RE.test(colName) &&
      numericCount >= threshold &&
      serialDateCount >= numericCount * 0.9;

    if (nonNullCount > 0) {
      if (isSerialDateCol) inferredType = "date";
      else if (booleanCount >= threshold) inferredType = "boolean";
      else if (numericCount >= threshold && !nameIsId && !hasLeadingZero) inferredType = "number";
      else if (dateCount >= threshold) inferredType = "date";
      else if (uniqueCount < 15 && uniqueCount / nonNullCount < 0.15) inferredType = "category";
    }

    // Validity: share of non-null cells conforming to the inferred type.
    let validityCount = 0;
    nonNullValues.forEach((val) => {
      if (inferredType === "number") {
        if (parseNumeric(val) !== null) validityCount++;
      } else if (inferredType === "boolean") {
        if (isBooleanLike(val)) validityCount++;
      } else if (inferredType === "date") {
        if (isSerialDateCol) {
          const n = parseNumeric(val);
          if ((n !== null && isExcelDateSerial(n)) || parseStrictDate(val) !== null) validityCount++;
        } else if (parseStrictDate(val) !== null) {
          validityCount++;
        }
      } else {
        validityCount++;
      }
    });
    const validity = nonNullCount > 0 ? (validityCount / nonNullCount) * 100 : 100;

    if (hasMojibake) mojibakeCols.push(colName);
    if (isSerialDateCol) excelDateCols.push(colName);

    const profile: ColumnProfile = {
      name: colName,
      type: inferredType,
      completeness,
      uniqueness,
      missingCount: rowCount - nonNullCount,
      uniqueCount,
      validity,
      hasWhitespace,
      hasMojibake,
    };

    if (inferredType === "number") {
      const numbers = nonNullValues
        .map((v) => parseNumeric(v))
        .filter((n): n is number => n !== null);

      numbers.sort((a, b) => a - b);
      if (numbers.length > 0) {
        const min = numbers[0];
        const max = numbers[numbers.length - 1];
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const median = percentile(numbers, 50);
        const p25 = percentile(numbers, 25);
        const p75 = percentile(numbers, 75);
        const iqr = p75 - p25;

        // Sample standard deviation (Bessel's correction, n-1).
        const std =
          numbers.length > 1
            ? Math.sqrt(numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / (numbers.length - 1))
            : 0;

        // IQR outlier fences.
        const lo = p25 - 1.5 * iqr;
        const hi = p75 + 1.5 * iqr;
        const outlierCount = numbers.filter((n) => n < lo || n > hi).length;

        profile.min = r2(min);
        profile.max = r2(max);
        profile.mean = r2(mean);
        profile.median = r2(median);
        profile.p25 = r2(p25);
        profile.p75 = r2(p75);
        profile.iqr = r2(iqr);
        profile.std = r2(std);
        profile.outlierCount = isIndexCol ? 0 : outlierCount;

        if (!isIndexCol) {
          accuracyScores.push((1 - outlierCount / numbers.length) * 100);
        }
      }
    } else if (inferredType === "date") {
      const times = nonNullValues
        .map((v) => {
          if (isSerialDateCol) {
            const n = parseNumeric(v);
            if (n !== null && isExcelDateSerial(n)) return Date.parse(excelSerialToIso(n));
          }
          return parseStrictDate(v);
        })
        .filter((t): t is number => t !== null && !Number.isNaN(t));
      if (times.length > 0) {
        profile.dateMin = new Date(Math.min(...times)).toISOString().slice(0, 10);
        profile.dateMax = new Date(Math.max(...times)).toISOString().slice(0, 10);
      }
    } else {
      // Categorical / string / boolean value grouping.
      const counts: Record<string, number> = {};
      nonNullValues.forEach((v) => {
        const key = String(v).trim();
        counts[key] = (counts[key] || 0) + 1;
      });
      profile.topValues = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Casing consistency: a mostly-Mixed-Case column with lower/UPPER strays.
      const strings = nonNullValues.filter((v): v is string => typeof v === "string");
      if (strings.length >= 5) {
        const styles = strings.map((s) => caseStyle(s.trim()));
        const letterLed = styles.filter((s) => s !== "other");
        const mixed = letterLed.filter((s) => s === "mixed").length;
        const strays = letterLed.filter((s) => s === "lower" || s === "upper").length;
        if (letterLed.length >= 5 && mixed >= letterLed.length * 0.6 && strays > 0) {
          casingCols.push(colName);
        }
      }

      // Near-duplicate category values (typos, plurals, spacing variants).
      if (uniqueCount >= 2 && uniqueCount <= 25 && strings.length > 0) {
        const freq = new Map<string, number>(Object.entries(counts));
        const mapping = findMergeCandidates(freq);
        if (Object.keys(mapping).length > 0) {
          mergeCols.push({ column: colName, mapping });
        }
      }
    }

    // Identifier-ish column with repeated values → possible near-duplicate rows.
    if (nonNullCount > 4 && uniqueCount < nonNullCount && (nameIsId || isIndexCol)) {
      dupIdCols.push(colName);
    }

    return profile;
  });

  // 3. Generate Diagnostics & Warnings
  const diagnostics: Diagnostic[] = [];

  // Structural: index columns imported from spreadsheets add noise.
  indexCols.forEach((col) => {
    diagnostics.push({
      id: `diag_index_${col}`,
      severity: "warning",
      title: `Index Column '${col}'`,
      description: `'${col}' just counts the rows (${col === "__EMPTY" ? "an unnamed spreadsheet index" : "a serial number"}). It adds noise to stats and charts.`,
      fix: { op: { kind: "dropColumn", column: col }, label: "Drop Column" },
    });
  });

  if (mojibakeCols.length > 0) {
    diagnostics.push({
      id: "diag_encoding",
      severity: "warning",
      title: "Broken Text Encoding",
      description: `Columns (${mojibakeCols.slice(0, 3).join(", ")}) contain garbled characters like "â€“". This usually means a CSV was saved with the wrong encoding.`,
      fix: { op: { kind: "fixEncoding" }, label: "Repair Encoding" },
    });
  }

  excelDateCols.forEach((col) => {
    const p = profiles.find((x) => x.name === col);
    diagnostics.push({
      id: `diag_exceldate_${col}`,
      severity: "warning",
      title: `Excel Serial Dates in '${col}'`,
      description: `Values like 44391 are Excel day numbers${p?.dateMin ? ` (${p.dateMin} → ${p.dateMax})` : ""}. Convert them to real dates for time-series analysis.`,
      fix: { op: { kind: "convertExcelDates", column: col }, label: "Convert to Dates" },
    });
  });

  if (duplicateRows > 0) {
    diagnostics.push({
      id: "diag_duplicates",
      severity: "warning",
      title: "Duplicate Rows Found",
      description: `There are ${duplicateRows} identical rows in the dataset that might inflate statistics.`,
      fix: { op: { kind: "dropDuplicates" }, label: "Remove Duplicates" },
    });
  }

  dupIdCols.forEach((col) => {
    diagnostics.push({
      id: `diag_dupid_${col}`,
      severity: "warning",
      title: `Repeated IDs in '${col}'`,
      description: `'${col}' looks like a unique identifier but has repeated values, which often means two rows are near-duplicates that differ in one cell. Repair the encoding, whitespace, and typos first, then check duplicates again.`,
    });
  });

  const hasEmptyRows = rows.some((row) => Object.values(row).every(isEmpty));
  if (hasEmptyRows) {
    diagnostics.push({
      id: "diag_empty_rows",
      severity: "warning",
      title: "Empty Rows Detected",
      description: "Some rows are completely blank and should be excluded.",
      fix: { op: { kind: "dropEmptyRows" }, label: "Clear Blank Rows" },
    });
  }

  const whitespaceCols = profiles.filter((p) => p.hasWhitespace).map((p) => p.name);
  if (whitespaceCols.length > 0) {
    diagnostics.push({
      id: "diag_whitespace",
      severity: "warning",
      title: "Whitespace Inconsistencies",
      description: `Columns (${whitespaceCols.slice(0, 3).join(", ")}) contain stray or doubled-up spaces ("George    Clinton").`,
      fix: { op: { kind: "trimWhitespace" }, label: "Normalize Spacing" },
    });
  }

  casingCols.forEach((col) => {
    diagnostics.push({
      id: `diag_case_${col}`,
      severity: "warning",
      title: `Inconsistent Casing in '${col}'`,
      description: `Most values are Mixed Case but some are all-lower or ALL-CAPS ("john adams", "JAMES MONROE"). Group-bys will treat them as different values.`,
      fix: { op: { kind: "standardizeCase", column: col }, label: "Standardize Casing" },
    });
  });

  mergeCols.forEach(({ column, mapping }) => {
    const pairs = Object.entries(mapping)
      .slice(0, 3)
      .map(([from, to]) => `"${from}" → "${to}"`)
      .join(", ");
    diagnostics.push({
      id: `diag_merge_${column}`,
      severity: "warning",
      title: `Similar Values in '${column}'`,
      description: `Likely typos or variants of the same category: ${pairs}. Merging them keeps group-bys honest.`,
      fix: { op: { kind: "mergeValues", column, mapping }, label: "Merge Variants" },
    });
  });

  // Missing values warnings per column
  profiles.forEach((p) => {
    if (p.completeness < 100) {
      const label = p.type === "number" ? "median" : "mode";
      diagnostics.push({
        id: `diag_missing_${p.name}`,
        severity: "warning",
        title: `Nulls in Column '${p.name}'`,
        description: `This column is missing ${p.missingCount} values (${(100 - p.completeness).toFixed(1)}% incomplete).`,
        fix: {
          op: { kind: "fillMissing", column: p.name, strategy: p.type === "number" ? "median" : "mode" },
          label: `Impute via ${label}`,
        },
      });
    }
  });

  // Outlier warnings per numeric column (informational, no automatic fix).
  profiles.forEach((p) => {
    if (p.type === "number" && p.outlierCount && p.outlierCount > 0) {
      diagnostics.push({
        id: `diag_outliers_${p.name}`,
        severity: "warning",
        title: `Outliers in '${p.name}'`,
        description: `${p.outlierCount} value(s) fall outside the expected range [${p.p25! - 1.5 * p.iqr!} … ${p.p75! + 1.5 * p.iqr!}] (1.5×IQR). Review before averaging.`,
      });
    }
  });

  // 4. Calculate overall health score
  const completenessAvg = profiles.reduce((acc, p) => acc + p.completeness, 0) / (columns.length || 1);
  const validityAvg = profiles.reduce((acc, p) => acc + p.validity, 0) / (columns.length || 1);
  const accuracy = accuracyScores.length > 0
    ? accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length
    : 100;

  // Consistency is reduced by structural and formatting problems.
  let consistency = 100;
  if (duplicateRows > 0) consistency -= 10;
  if (whitespaceCols.length > 0) consistency -= 5;
  if (mojibakeCols.length > 0) consistency -= 15;
  if (casingCols.length > 0) consistency -= 10;
  if (mergeCols.length > 0) consistency -= 10;
  if (excelDateCols.length > 0) consistency -= 5;
  if (dupIdCols.length > 0) consistency -= 5;
  consistency = Math.max(10, consistency);

  const overall = Math.round(
    completenessAvg * 0.4 +
    validityAvg * 0.2 +
    accuracy * 0.2 +
    consistency * 0.2
  );

  const health: DatasetHealth = {
    overall,
    completeness: Math.round(completenessAvg),
    accuracy: Math.round(accuracy),
    validity: Math.round(validityAvg),
    consistency: Math.round(consistency),
  };

  return {
    id,
    name,
    columns,
    rows,
    profiles,
    health,
    diagnostics,
    duplicateRows,
    createdAt,
    updatedAt: Date.now(),
    changelog,
    truncated,
  };
}
