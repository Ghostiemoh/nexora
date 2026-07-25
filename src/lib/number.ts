/* Shared numeric coercion. Used by profiling, the SQL engine, and cleaning so
 * that "1,200", "$1,200", "(1,200)", and "50%" are all understood consistently
 * instead of being silently dropped from stats and aggregates. */

/**
 * Parse a cell into a finite number, or return null when it is not numeric.
 * Handles thousands separators, currency symbols, percent signs, and
 * accounting-style negatives like "(1,200)".
 */
export function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null || value === undefined) return null;

  let s = String(value).trim();
  if (s === "") return null;

  // Accounting negatives: (1,200) -> -1200
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Strip common currency symbols, grouping separators, percent, and whitespace.
  s = s.replace(/[$€£¥₦,%\s]/g, "");
  if (s === "" || s === "-" || s === "+") return null;

  // Reject hex/octal/binary literals and other non-decimal forms that Number()
  // would otherwise accept (e.g. "0x10"), which are almost always identifiers.
  if (/[^0-9eE.+-]/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** True when the raw value looks like a fixed-format identifier that must stay
 *  a string (leading-zero codes such as ZIPs, account numbers, ISBNs). */
export function hasLeadingZeroId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^0\d+$/.test(value.trim());
}

const ID_NAME = /(^|[_\s-])(id|zip|zipcode|postal|postcode|phone|mobile|fax|ssn|uuid|guid|account|acct|sku|isbn|msisdn|empty)([_\s-]|$)/i;

/** Whole names (after stripping punctuation) that mark serial/index columns,
 *  e.g. "S.No.", "Sr No", "row #". */
const ID_EXACT = new Set([
  "sno", "srno", "slno", "serial", "serialno", "no", "num",
  "index", "idx", "rowid", "rownum", "rowno", "row", "record", "recordno",
]);

/** True when a column name signals an identifier that should not be treated as
 *  a numeric measure even if every value parses as a number. */
export function isIdentifierName(name: string): boolean {
  if (ID_NAME.test(name)) return true;
  return ID_EXACT.has(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** True when a numeric column is a row index in disguise: 0- or 1-based
 *  integers forming a consecutive, row-ordered run (adjacent duplicates from
 *  copy-pasted rows tolerated). Consecutive runs starting elsewhere (e.g.
 *  amounts 50..69) are NOT indexes. `values` must be in original row order. */
export function isSequentialIndex(values: number[]): boolean {
  const n = values.length;
  if (n < 5) return false;
  const uniq = new Set<number>();
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isInteger(v)) return false;
    if (i > 0 && v < values[i - 1]) return false; // indexes never go backwards
    uniq.add(v);
  }
  if (uniq.size < n * 0.95) return false;
  const min = values[0];
  if (min !== 0 && min !== 1) return false;
  return min + uniq.size - 1 === values[n - 1];
}
