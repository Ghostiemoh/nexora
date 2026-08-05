"use client";

/* The dataset as a spreadsheet.
 *
 * Two jobs. First, show the data the way the analyst last saw it in Excel:
 * column letters, row numbers, cell references. Second, show what a fix is
 * about to do, in place, before it is committed — the old value struck through
 * and the new one beside it, the doomed rows dimmed, the touched columns
 * marked. A change you can see is a change you can judge. */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CellValue, Dataset, Row } from "@/lib/types";
import { cellRef, columnLetter, type CellIssue, type CellIssueRule } from "@/lib/cell-issues";
import { changeKey, type OpDiff } from "@/lib/recipe";

const PAGE_SIZE = 25;

/** The tint each kind of problem paints its cell with. */
const RULE_TINT: Record<CellIssueRule, string> = {
  missing: "bg-amber-400/[0.13] text-amber-200",
  typeMismatch: "bg-rose-400/[0.13] text-rose-200",
  outlier: "bg-violet-400/[0.13] text-violet-200",
  whitespace: "bg-sky-400/[0.10] text-sky-200",
  encoding: "bg-rose-400/[0.13] text-rose-200",
  casing: "bg-sky-400/[0.10] text-sky-200",
  variant: "bg-teal-400/[0.10] text-teal-200",
  excelSerial: "bg-violet-400/[0.13] text-violet-200",
};

export interface DataGridProps {
  dataset: Dataset;
  /** issues to paint onto the cells */
  issues?: CellIssue[];
  /** the pending fix, rendered as a before/after overlay */
  diff?: OpDiff | null;
  /** jump the grid to the page holding this row */
  focusRow?: number | null;
  /** raised when a cell is clicked */
  onSelectCell?: (rowIndex: number, column: string) => void;
}

function renderValue(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

export function DataGrid({ dataset, issues = [], diff, focusRow, onSelectCell }: DataGridProps) {
  const [page, setPage] = useState(0);
  const [lastFocus, setLastFocus] = useState<number | null>(null);

  const pageCount = Math.max(1, Math.ceil(dataset.rows.length / PAGE_SIZE));

  // Following a cell reference should land on the page that holds it, without
  // an effect that fights the reader's own paging.
  if (focusRow != null && focusRow !== lastFocus) {
    setLastFocus(focusRow);
    const target = Math.min(Math.floor(focusRow / PAGE_SIZE), pageCount - 1);
    if (target !== page) setPage(target);
  }

  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = dataset.rows.slice(start, start + PAGE_SIZE);

  /** rowIndex:column → the issue painted there. */
  const issueMap = useMemo(() => {
    const map = new Map<string, CellIssue>();
    for (const issue of issues) {
      const key = changeKey(issue.rowIndex, issue.column);
      // The first issue on a cell wins; they are already in reading order.
      if (!map.has(key)) map.set(key, issue);
    }
    return map;
  }, [issues]);

  const removedRows = useMemo(() => new Set(diff?.removedRows ?? []), [diff]);
  const affectedColumns = useMemo(
    () => new Set(diff?.affectedColumns ?? []),
    [diff]
  );

  const columns = dataset.columns;

  return (
    <div className="nexora-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <p className="font-mono text-[11px] text-on-surface-variant">
          Rows {(start + 1).toLocaleString("en-US")}–
          {Math.min(start + PAGE_SIZE, dataset.rows.length).toLocaleString("en-US")} of{" "}
          {dataset.rows.length.toLocaleString("en-US")}
          <span className="mx-2 opacity-40">·</span>
          {columns.length} column{columns.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            aria-label="Previous rows"
            className="press flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-[68px] text-center font-mono text-[11px] text-on-surface-variant">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            aria-label="Next rows"
            className="press flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full border-collapse text-left font-mono text-[11.5px]">
          <thead className="sticky top-0 z-20">
            {/* Column letters, so a reference like C42 is something you can
                actually find by eye. */}
            <tr className="bg-surface-container text-on-surface-variant/60">
              <th className="sticky left-0 z-30 w-12 bg-surface-container px-2 py-1 text-[10px] font-normal">
                <span className="sr-only">Row</span>
              </th>
              {columns.map((column, i) => (
                <th
                  key={column}
                  className={`px-3 py-1 text-[10px] font-normal ${
                    affectedColumns.has(column) ? "text-primary" : ""
                  }`}
                >
                  {columnLetter(i)}
                </th>
              ))}
            </tr>
            <tr className="border-b border-white/[0.08] bg-surface-container-low">
              <th className="sticky left-0 z-30 bg-surface-container-low px-2 py-2 text-[10px] font-medium text-on-surface-variant">
                #
              </th>
              {columns.map((column) => {
                const profile = dataset.profiles.find((p) => p.name === column);
                const removed = diff?.removedColumns.includes(column);
                const added = diff?.addedColumns.includes(column);
                return (
                  <th
                    key={column}
                    className={`whitespace-nowrap px-3 py-2 font-medium ${
                      removed
                        ? "text-rose-300 line-through"
                        : added
                          ? "text-emerald-300"
                          : affectedColumns.has(column)
                            ? "text-primary"
                            : "text-white"
                    }`}
                    title={profile ? `${column} · ${profile.type}` : column}
                  >
                    {column}
                    <span className="ml-1.5 text-[9px] font-normal uppercase tracking-wider text-on-surface-variant/60">
                      {profile?.type ?? "new"}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-on-surface-variant">
            {visible.map((row: Row, i) => {
              const rowIndex = start + i;
              const doomed = removedRows.has(rowIndex);
              return (
                <tr
                  key={rowIndex}
                  className={`transition-colors ${
                    doomed ? "bg-rose-500/[0.07] opacity-55" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 px-2 py-1.5 text-right text-[10px] font-normal tabular-nums ${
                      doomed
                        ? "bg-surface-container text-rose-300"
                        : "bg-surface-container-low text-on-surface-variant/60"
                    }`}
                  >
                    {rowIndex + 2}
                  </th>
                  {columns.map((column) => {
                    const key = changeKey(rowIndex, column);
                    const change = diff?.changed.get(key);
                    const issue = issueMap.get(key);
                    const value = row[column] ?? null;
                    const removedColumn = diff?.removedColumns.includes(column);

                    return (
                      <td
                        key={column}
                        onClick={onSelectCell ? () => onSelectCell(rowIndex, column) : undefined}
                        title={
                          issue
                            ? `${issue.ref} · ${issue.label}: ${issue.detail}`
                            : `${cellRef(columns.indexOf(column), rowIndex)}`
                        }
                        className={`max-w-[240px] truncate px-3 py-1.5 tabular-nums ${
                          onSelectCell ? "cursor-pointer" : ""
                        } ${
                          change
                            ? "bg-emerald-400/[0.10]"
                            : removedColumn
                              ? "text-rose-300/50 line-through"
                              : issue
                                ? RULE_TINT[issue.rule]
                                : ""
                        }`}
                      >
                        {change ? (
                          // Before and after side by side: the change is
                          // readable without holding the old value in your head.
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-rose-300/70 line-through">
                              {renderValue(change.before) || "—"}
                            </span>
                            <span className="text-on-surface-variant/40" aria-hidden="true">
                              →
                            </span>
                            <span className="truncate font-medium text-emerald-200">
                              {renderValue(change.after) || "—"}
                            </span>
                          </span>
                        ) : value === null || String(value).trim() === "" ? (
                          <span className="text-on-surface-variant/25">empty</span>
                        ) : (
                          renderValue(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(issues.length > 0 || diff) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] px-4 py-2.5 text-[10.5px] text-on-surface-variant">
          {diff ? (
            <>
              <Legend className="bg-emerald-400/25" label="Cell this fix rewrites" />
              <Legend className="bg-rose-500/25" label="Row this fix removes" />
            </>
          ) : (
            <>
              <Legend className="bg-amber-400/25" label="Missing" />
              <Legend className="bg-rose-400/25" label="Type or encoding" />
              <Legend className="bg-violet-400/25" label="Outlier" />
              <Legend className="bg-sky-400/25" label="Format" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
