/* Recovering table structure from extracted text.
 *
 * A PDF page is a heading, a paragraph, a table, a footnote, and a page
 * number. Only one of those is a dataset, so the job is to find where the grid
 * starts and stops rather than to split every line and hope.
 *
 * Two rules drive the whole module:
 *
 *   Never drop a cell. An empty cell is data. The previous implementation
 *   filtered blanks out while splitting, which slid every later value one
 *   column to the left, so a row with no Quantity quietly filed its Revenue
 *   under Quantity. That produces a table that still looks right, which is the
 *   worst possible failure for something an analyst is about to trust.
 *
 *   Consistency defines a table. Prose has a wildly varying number of fields
 *   per line; a table has the same number, line after line. Runs of lines that
 *   agree on their field count are the tables, and everything else is text. */

import type { Row } from "./types";

export type CellKind = "number" | "text";

export interface ExtractedTable {
  /** 0-based line indices into the source, for showing where this came from */
  startLine: number;
  endLine: number;
  columns: string[];
  rows: Row[];
  /** false when the first row looked like data, so headers were generated */
  hasHeader: boolean;
  /** 0 to 1: how table-shaped this block is */
  confidence: number;
  columnTypes: CellKind[];
  /** header rows found again mid-table, i.e. a table spanning pages */
  repeatedHeadersDropped: number;
}

export interface ExtractionResult {
  tables: ExtractedTable[];
  /** everything that was not part of a table */
  text: string;
}

/** Shortest run of lines that can be a table. Two lines is a heading over a
 *  subtitle far more often than it is a one-row table. */
const MIN_TABLE_LINES = 3;
const MIN_COLUMNS = 2;

interface Candidate {
  name: string;
  split: (line: string) => string[];
}

/* Order matters: the most explicit delimiter that works wins. Two-or-more
 * spaces is last because it also matches inside sentences. */
const CANDIDATES: Candidate[] = [
  { name: "tab", split: (l) => l.split("\t") },
  {
    name: "pipe",
    // A leading and trailing pipe is markdown border, not an empty first cell.
    split: (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|"),
  },
  { name: "semicolon", split: (l) => l.split(";") },
  { name: "comma", split: (l) => l.split(",") },
  { name: "spaces", split: (l) => l.split(/\s{2,}/) },
];

/** A markdown alignment row: |---|---:|. Formatting, never data. */
const isSeparatorRow = (cells: string[]): boolean =>
  cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()) || c.trim() === "");

/** Read a cell as a number, tolerating the ways numbers appear in documents.
 *  Returns null for anything that is not unambiguously numeric. */
export function parseNumericCell(value: string): number | null {
  const raw = value.trim();
  if (raw === "" || raw === "-" || raw === "—") return null;

  // Dates contain digits and separators but are not quantities.
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(raw)) return null;
  if (/\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(raw)) return null;

  // Accounting style: (1,500) means negative.
  const parenthesised = /^\((.*)\)$/.exec(raw);
  const body = parenthesised ? parenthesised[1] : raw;

  // Strip currency symbols, spaces, thousands separators, and a trailing %.
  const cleaned = body
    .replace(/[$£€¥₦₹]/g, "")
    .replace(/%$/, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  // Whatever is left has to be the entire number, so "Q1 2026" cannot pass.
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return parenthesised ? -n : n;
}

/** Split a line into cells without ever discarding one. */
function splitLine(line: string, candidate: Candidate): string[] {
  return candidate.split(line).map((c) => c.trim());
}

/** Pick the delimiter that produces the most consistent grid across the doc. */
function chooseCandidate(lines: string[]): Candidate | null {
  let best: { candidate: Candidate; score: number } | null = null;

  for (const candidate of CANDIDATES) {
    // Count how many lines agree on the most popular field count.
    const counts = new Map<number, number>();
    for (const line of lines) {
      if (line.trim() === "") continue;
      const n = splitLine(line, candidate).length;
      if (n < MIN_COLUMNS) continue;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    if (counts.size === 0) continue;

    let agreeing = 0;
    let width = 0;
    for (const [n, c] of counts) {
      if (c > agreeing) {
        agreeing = c;
        width = n;
      }
    }
    if (agreeing < MIN_TABLE_LINES) continue;

    // Prefer more agreeing lines, then wider tables.
    const score = agreeing * 10 + width;
    if (!best || score > best.score) best = { candidate, score };
  }

  return best?.candidate ?? null;
}

/** Consecutive runs of lines that share a field count. */
function findBlocks(
  lines: string[],
  candidate: Candidate
): { start: number; end: number; width: number }[] {
  const blocks: { start: number; end: number; width: number }[] = [];
  let start = -1;
  let width = 0;

  const flush = (end: number) => {
    if (start >= 0 && end - start + 1 >= MIN_TABLE_LINES && width >= MIN_COLUMNS) {
      blocks.push({ start, end, width });
    }
    start = -1;
    width = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      flush(i - 1);
      continue;
    }
    const cells = splitLine(line, candidate);
    // A separator row belongs to whatever block it sits in.
    if (isSeparatorRow(cells) && start >= 0) continue;

    const n = cells.length;
    if (n < MIN_COLUMNS) {
      flush(i - 1);
      continue;
    }
    if (start < 0) {
      start = i;
      width = n;
    } else if (n !== width) {
      // A one-off ragged line is tolerated inside a table (OCR drops a cell),
      // but a change that persists starts a new block.
      const next = lines[i + 1];
      const nextWidth = next && next.trim() !== "" ? splitLine(next, candidate).length : -1;
      if (nextWidth !== width) {
        flush(i - 1);
        start = i;
        width = n;
      }
    }
  }
  flush(lines.length - 1);

  return blocks;
}

/** Does this row look like labels rather than measurements? */
function looksLikeHeader(cells: string[], body: string[][]): boolean {
  const headerNumbers = cells.filter((c) => parseNumericCell(c) !== null).length;
  // A header that is mostly numbers is not a header.
  if (headerNumbers > cells.length / 2) return false;

  // If the body has numbers in positions where the first row has text, the
  // first row is naming those columns.
  let contrast = 0;
  for (let col = 0; col < cells.length; col++) {
    const headerIsText = parseNumericCell(cells[col]) === null;
    const bodyNumeric = body.filter((r) => parseNumericCell(r[col] ?? "") !== null).length;
    if (headerIsText && bodyNumeric > body.length / 2) contrast++;
  }
  if (contrast > 0) return true;

  // No numeric columns at all: fall back to the header being non-empty text.
  const allText = body.every((r) => r.every((c) => parseNumericCell(c) === null));
  return allText && cells.every((c) => c.trim() !== "");
}

/** Unique, non-empty, usable-as-a-key column names. */
function nameColumns(header: string[] | null, width: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const raw = header?.[i]?.trim() ?? "";
    const base = raw === "" ? `column_${i + 1}` : raw;
    let name = base;
    let suffix = 2;
    while (out.includes(name)) {
      name = `${base}_${suffix}`;
      suffix++;
    }
    out.push(name);
  }
  return out;
}

function buildTable(
  lines: string[],
  block: { start: number; end: number; width: number },
  candidate: Candidate
): ExtractedTable | null {
  const raw: string[][] = [];
  for (let i = block.start; i <= block.end; i++) {
    if (lines[i].trim() === "") continue;
    const cells = splitLine(lines[i], candidate);
    if (isSeparatorRow(cells)) continue;
    raw.push(cells);
  }
  if (raw.length < 2) return null;

  const width = block.width;
  const first = raw[0];
  const rest = raw.slice(1);
  const hasHeader = looksLikeHeader(first, rest);

  const header = hasHeader ? first : null;
  const columns = nameColumns(header, width);
  let body = hasHeader ? rest : raw;

  // A table continued on the next page repeats its header. Drop those, but
  // only when there genuinely was a header to repeat.
  let repeatedHeadersDropped = 0;
  if (header) {
    const signature = header.map((c) => c.trim().toLowerCase()).join(" ");
    const kept = body.filter((r) => {
      const same = r.map((c) => c.trim().toLowerCase()).join(" ") === signature;
      if (same) repeatedHeadersDropped++;
      return !same;
    });
    body = kept;
  }
  if (body.length === 0) return null;

  // A column is numeric when most of its non-empty cells parse as numbers.
  const columnTypes: CellKind[] = [];
  for (let col = 0; col < width; col++) {
    let filled = 0;
    let numeric = 0;
    for (const r of body) {
      const cell = (r[col] ?? "").trim();
      if (cell === "") continue;
      filled++;
      if (parseNumericCell(cell) !== null) numeric++;
    }
    columnTypes.push(filled > 0 && numeric >= filled * 0.6 ? "number" : "text");
  }

  const rows: Row[] = body.map((cells) => {
    const row: Row = {};
    for (let col = 0; col < width; col++) {
      // Never shift: a short row gets nulls on the right, not a slide left.
      const cell = (cells[col] ?? "").trim();
      if (cell === "") {
        row[columns[col]] = null;
      } else if (columnTypes[col] === "number") {
        row[columns[col]] = parseNumericCell(cell) ?? cell;
      } else {
        row[columns[col]] = cell;
      }
    }
    return row;
  });

  // Confidence: how many rows arrived at exactly the expected width, and how
  // few cells came out empty. Both are visible to the user in the preview.
  const exact = body.filter((r) => r.length === width).length / body.length;
  const cells = body.length * width;
  const empty = rows.reduce(
    (n, r) => n + columns.filter((c) => r[c] === null).length,
    0
  );
  const filled = cells === 0 ? 0 : 1 - empty / cells;
  const confidence = Math.round((exact * 0.7 + filled * 0.3) * 100) / 100;

  return {
    startLine: block.start,
    endLine: block.end,
    columns,
    rows,
    hasHeader,
    confidence,
    columnTypes,
    repeatedHeadersDropped,
  };
}

/** Find the tables in a block of extracted text, and return what was left. */
export function extractTables(source: string): ExtractionResult {
  const lines = source.split("\n");
  const candidate = chooseCandidate(lines);
  if (!candidate) return { tables: [], text: source.trim() };

  const tables: ExtractedTable[] = [];
  const consumed = new Set<number>();

  for (const block of findBlocks(lines, candidate)) {
    const built = buildTable(lines, block, candidate);
    if (!built) continue;
    tables.push(built);
    for (let i = block.start; i <= block.end; i++) consumed.add(i);
  }

  const text = lines
    .filter((_, i) => !consumed.has(i))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { tables, text };
}
