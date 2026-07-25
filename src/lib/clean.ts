import type { Row, CleanOp, CellValue } from "./types";
import { parseNumeric } from "./number";

/* ── mojibake repair ──────────────────────────────────────────────────
 * Mojibake happens when UTF-8 text is read as cp1252 ("–" becomes
 * "â€“"), sometimes twice over in re-exported CSVs. Rather
 * than hard-coding fragile literal sequences, we derive them: for each
 * target character, compute its UTF-8 bytes mapped through cp1252 (the
 * single-mangled form), mangle that again (the double form), and a
 * "lossy" variant with the invisible/control bytes dropped — which is
 * what survives a careless CSV round-trip. */

const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

/** Encode a string to UTF-8, then decode each byte as cp1252 — one round of mangling. */
function mangle(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(CP1252[b] ?? b);
  return out;
}

/** Drop the characters that lossy charset conversions silently discard. */
function stripInvisible(s: string): string {
  return s.replace(/[-‚€“”‘’…˜™ƒ„]/g, "");
}

/** Characters that commonly get mangled: dashes, curly quotes, ellipsis,
 *  accented Latin letters, degree/currency, non-breaking space. */
const MOJIBAKE_TARGETS =
  "–—‘’“”…éèáíóúñüöäç°£ ";

const MOJIBAKE_TABLE: [string, string][] = (() => {
  const entries = new Map<string, string>();
  for (const target of MOJIBAKE_TARGETS) {
    const replacement = target === " " ? " " : target;
    const single = mangle(target);
    const double = mangle(single);
    for (const form of [double, stripInvisible(double), single, stripInvisible(single)]) {
      if (form.length >= 2 && form !== replacement && !entries.has(form)) {
        entries.set(form, replacement);
      }
    }
  }
  // Longest keys first so prefixes ("â€") never shadow full sequences ("â€“").
  return Array.from(entries).sort((a, b) => b[0].length - a[0].length);
})();

/** Detects broken text encoding worth repairing: â€¦ / Ã© / Â° style artifacts. */
export const MOJIBAKE_RE = /â€|Ã[-ÿ€‘’“”‚ˆ‹Œ]|Â[ -¿]/;

export function fixMojibake(s: string): string {
  let out = s;
  for (let pass = 0; pass < 2 && MOJIBAKE_RE.test(out); pass++) {
    for (const [bad, good] of MOJIBAKE_TABLE) {
      out = out.split(bad).join(good);
    }
  }
  return out;
}

/* ── Excel serial dates ── */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Excel serial day number → ISO yyyy-mm-dd (UTC). */
export function excelSerialToIso(serial: number): string {
  return new Date(EXCEL_EPOCH_MS + serial * 86_400_000).toISOString().slice(0, 10);
}

/** Plausible Excel date serial: integer covering ~1954–2064. */
export function isExcelDateSerial(n: number): boolean {
  return Number.isInteger(n) && n >= 20_000 && n <= 60_000;
}

/** Title-case a value, capitalizing after spaces, hyphens, periods, quotes. */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-.'(])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

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
        return !Object.values(row).every((v) => v === null || v === undefined || String(v).trim() === "");
      });
    }

    case "trimWhitespace": {
      // Trim the edges and collapse internal runs ("George    Clinton").
      return rows.map((row) => {
        const next: Row = {};
        for (const [k, v] of Object.entries(row)) {
          next[k] = typeof v === "string" ? v.trim().replace(/\s{2,}/g, " ") : v;
        }
        return next;
      });
    }

    case "fixEncoding": {
      return rows.map((row) => {
        const next: Row = {};
        for (const [k, v] of Object.entries(row)) {
          next[k] = typeof v === "string" ? fixMojibake(v) : v;
        }
        return next;
      });
    }

    case "standardizeCase": {
      // Only rewrite the deviants (all-lower or ALL-UPPER); values that are
      // already mixed case are left exactly as entered.
      return rows.map((row) => {
        const v = row[op.column];
        if (typeof v !== "string") return row;
        const t = v.trim();
        if (t === "" || !/[a-zA-Z]/.test(t)) return row;
        if (t === t.toLowerCase() || t === t.toUpperCase()) {
          return { ...row, [op.column]: titleCase(v) };
        }
        return row;
      });
    }

    case "mergeValues": {
      return rows.map((row) => {
        const v = row[op.column];
        if (v === null || v === undefined) return row;
        const mapped = op.mapping[String(v).trim()];
        return mapped === undefined ? row : { ...row, [op.column]: mapped };
      });
    }

    case "convertExcelDates": {
      return rows.map((row) => {
        const n = parseNumeric(row[op.column]);
        if (n === null || !isExcelDateSerial(n)) return row;
        return { ...row, [op.column]: excelSerialToIso(n) };
      });
    }

    case "findReplace": {
      // Excel's Ctrl+H: plain-text find/replace across one column or all text
      // cells. Never touches numbers or booleans.
      const { column, find, replace, matchCase = false } = op;
      if (find === "") return rows;
      const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, matchCase ? "g" : "gi");
      return rows.map((row) => {
        let changed = false;
        const next: Row = {};
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === "string" && (column === null || k === column)) {
            const replaced = v.replace(re, replace);
            if (replaced !== v) changed = true;
            next[k] = replaced;
          } else {
            next[k] = v;
          }
        }
        return changed ? next : row;
      });
    }

    case "splitColumn": {
      // Excel's Text to Columns: split one column on a delimiter into
      // column_1..column_n, preserving column order at the split position.
      const { column, delimiter, keepOriginal = false } = op;
      if (delimiter === "" || rows.length === 0) return rows;

      const partsPerRow = rows.map((row) => {
        const v = row[column];
        if (v === null || v === undefined || typeof v !== "string") return null;
        return v.split(delimiter).map((p) => p.trim());
      });
      const maxParts = Math.min(
        12, // sanity cap so a bad delimiter can't explode the schema
        partsPerRow.reduce((m, p) => Math.max(m, p ? p.length : 0), 0)
      );
      if (maxParts < 2) return rows; // nothing to split

      // Collision-safe generated names: column_1, column_2, …
      const existing = new Set(Object.keys(rows[0]));
      const newNames: string[] = [];
      for (let i = 1; i <= maxParts; i++) {
        let name = `${column}_${i}`;
        while (existing.has(name) || newNames.includes(name)) name = `${name}x`;
        newNames.push(name);
      }

      return rows.map((row, rowIdx) => {
        const parts = partsPerRow[rowIdx];
        const next: Row = {};
        for (const [k, v] of Object.entries(row)) {
          if (k === column) {
            if (keepOriginal) next[k] = v;
            newNames.forEach((name, i) => {
              const part = parts?.[i];
              next[name] = part === undefined || part === "" ? null : part;
            });
          } else {
            next[k] = v;
          }
        }
        return next;
      });
    }

    case "dropColumn": {
      return rows.map((row) => {
        const next: Row = {};
        for (const [k, v] of Object.entries(row)) {
          if (k !== op.column) next[k] = v;
        }
        return next;
      });
    }

    case "fillMissing": {
      const { column, strategy } = op;
      const nonNullVals = rows
        .map((r) => r[column])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "");

      if (nonNullVals.length === 0) return rows; // Nothing to fill

      let fillVal: CellValue = null;
      if (strategy === "median") {
        const numbers = nonNullVals
          .map((v) => parseNumeric(v))
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b);
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
        const v = row[column];
        if (v === null || v === undefined || String(v).trim() === "") {
          return { ...row, [column]: fillVal };
        }
        return row;
      });
    }

    default:
      return rows;
  }
}
