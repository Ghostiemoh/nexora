"use client";

/* The cleaning workbench.
 *
 * Everything a data-quality pass needs in one place: where each problem is, what
 * it would become, and the three answers you can give it — fix it, look at it
 * first, or say it is meant to be that way.
 *
 * The last one matters more than it sounds. A repeated ID can be correct. A
 * revenue spike can be the whole finding. Marking those intentional stops them
 * dragging the health score down forever, which is the difference between a
 * score you act on and a score you learn to ignore. */

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  Eye,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import type { CleanOp, Dataset } from "@/lib/types";
import { useNexora } from "@/lib/store";
import { DataGrid } from "./data-grid";
import {
  buildCellIssues,
  RULE_LABELS,
  type CellIssue,
  type CellIssueRule,
} from "@/lib/cell-issues";
import { diffCleanOp } from "@/lib/recipe";

const ISSUE_PAGE = 12;

interface Pending {
  op: CleanOp;
  label: string;
  /** what raised it, so the row can show itself as being previewed */
  issueId: string;
}

export function LiveWorkbench({ dataset }: { dataset: Dataset }) {
  const applyFix = useNexora((s) => s.applyFix);
  const undoFix = useNexora((s) => s.undoFix);
  const redoFix = useNexora((s) => s.redoFix);
  const undoDepth = useNexora((s) => s.undoDepth);
  const redoDepth = useNexora((s) => s.redoDepth);
  const skipDiagnostic = useNexora((s) => s.skipDiagnostic);
  const unskipDiagnostic = useNexora((s) => s.unskipDiagnostic);

  const [ruleFilter, setRuleFilter] = useState<CellIssueRule | null>(null);
  const [columnFilter, setColumnFilter] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [shown, setShown] = useState(ISSUE_PAGE);

  const skips = useMemo(() => dataset.skips ?? [], [dataset.skips]);

  /* A skip is stored as whatever was clicked: a finding id or a rule name.
   * Neither is something to show a reader, so each resolves back to the title
   * of the finding it silenced. */
  const skipLabel = (key: string): string => {
    const diagnostic = dataset.diagnostics.find((d) => d.id === key);
    if (diagnostic) return diagnostic.title;
    return RULE_LABELS[key as CellIssueRule] ?? key;
  };

  const report = useMemo(
    () => buildCellIssues(dataset, { skipped: skips, limit: 800 }),
    [dataset, skips]
  );

  const filtered = useMemo(() => {
    return report.issues.filter(
      (issue) =>
        (ruleFilter === null || issue.rule === ruleFilter) &&
        (columnFilter === null || issue.column === columnFilter)
    );
  }, [report.issues, ruleFilter, columnFilter]);

  // The pending fix is dry-run against the live rows, so the grid below shows
  // the actual result rather than a description of it.
  const diff = useMemo(
    () => (pending ? diffCleanOp(dataset.rows, dataset.columns, pending.op) : null),
    [pending, dataset.rows, dataset.columns]
  );

  const gridIssues = pending ? [] : filtered;

  const activeRules = (Object.keys(RULE_LABELS) as CellIssueRule[]).filter(
    (rule) => report.countsByRule[rule] > 0
  );

  const commit = (op: CleanOp) => {
    applyFix(dataset.id, op);
    setPending(null);
    setShown(ISSUE_PAGE);
  };

  const skip = (issue: CellIssue, scope: "one" | "rule") => {
    const key = scope === "rule" ? issue.rule : issue.diagnosticId;
    skipDiagnostic(dataset.id, key, scope === "rule" ? RULE_LABELS[issue.rule] : issue.label);
    if (pending?.issueId === issue.id) setPending(null);
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-on-surface-variant">
            {report.total.toLocaleString("en-US")} cell issue
            {report.total === 1 ? "" : "s"}
            {report.truncated && " (first 800 shown)"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => undoFix(dataset.id)}
            disabled={undoDepth(dataset.id) === 0}
            className="pill h-9 cursor-pointer border border-white/10 bg-white/5 px-3 text-[12.5px] text-on-surface hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
            title="Undo the last change"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Undo
          </button>
          <button
            type="button"
            onClick={() => redoFix(dataset.id)}
            disabled={redoDepth(dataset.id) === 0}
            className="pill h-9 cursor-pointer border border-white/10 bg-white/5 px-3 text-[12.5px] text-on-surface hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
            title="Reapply the change you undid"
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Redo
          </button>
        </div>
      </div>

      {/* ── Pending fix: nothing is committed until this is answered ── */}
      {pending && diff && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.07] p-3.5">
          <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[12.5px] text-on-surface">
            <span className="font-medium text-white">Previewing: {pending.label}.</span>{" "}
            {diff.removedRows.length > 0
              ? `${diff.removedRows.length.toLocaleString("en-US")} row(s) would be removed`
              : `${diff.changedCells.toLocaleString("en-US")} cell(s) would change`}
            {diff.affectedColumns.length > 0 &&
              ` in ${diff.affectedColumns.slice(0, 3).join(", ")}`}
            . Nothing has been applied yet.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="pill h-9 cursor-pointer border border-white/10 bg-white/5 px-3.5 text-[12.5px] text-on-surface hover:bg-white/[0.08]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => commit(pending.op)}
              className="pill h-9 cursor-pointer bg-primary px-4 text-[12.5px] text-on-primary"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Apply this fix
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      {activeRules.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={ruleFilter === null} onClick={() => setRuleFilter(null)}>
            All {report.total.toLocaleString("en-US")}
          </FilterChip>
          {activeRules.map((rule) => (
            <FilterChip
              key={rule}
              active={ruleFilter === rule}
              onClick={() => setRuleFilter(ruleFilter === rule ? null : rule)}
            >
              {RULE_LABELS[rule]} {report.countsByRule[rule].toLocaleString("en-US")}
            </FilterChip>
          ))}
          <select
            value={columnFilter ?? ""}
            onChange={(e) => setColumnFilter(e.target.value === "" ? null : e.target.value)}
            aria-label="Filter issues by column"
            className="ml-1 h-7 cursor-pointer rounded-full border border-white/10 bg-black/25 px-2.5 text-[11px] text-on-surface-variant outline-none focus:border-primary/50"
          >
            <option value="" className="bg-surface-container">
              Every column
            </option>
            {dataset.columns.map((column) => (
              <option key={column} value={column} className="bg-surface-container">
                {column}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── The issue list ── */}
      {report.total === 0 ? (
        <div className="nexora-card flex flex-col items-center justify-center p-10 text-center">
          <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-white">Every cell checks out</p>
          <p className="mt-1.5 max-w-[44ch] text-xs leading-relaxed text-on-surface-variant">
            No missing values, type violations, outliers, or format noise anywhere in this file.
          </p>
        </div>
      ) : (
        <div className="nexora-card overflow-hidden">
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-surface-container-low">
                <tr className="border-b border-white/[0.06] text-[10.5px] uppercase tracking-wider text-on-surface-variant">
                  <th className="px-3 py-2.5 font-medium">Cell</th>
                  <th className="px-3 py-2.5 font-medium">Column</th>
                  <th className="px-3 py-2.5 font-medium">Row</th>
                  <th className="px-3 py-2.5 font-medium">Error type</th>
                  <th className="px-3 py-2.5 font-medium">Suggested fix</th>
                  <th className="px-3 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.slice(0, shown).map((issue) => (
                  <tr
                    key={issue.id}
                    className={`transition-colors ${
                      pending?.issueId === issue.id ? "bg-primary/[0.07]" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setFocusRow(issue.rowIndex)}
                        title="Show this cell in the grid below"
                        className="press cursor-pointer rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/20"
                      >
                        {issue.ref}
                      </button>
                      {issue.sheet && (
                        <span className="ml-1.5 font-mono text-[10px] text-on-surface-variant/60">
                          {issue.sheet}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 font-mono text-white">
                      {issue.column}
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-on-surface-variant">
                      {issue.row}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-white">{issue.label}</span>
                      <p className="mt-0.5 max-w-[34ch] truncate text-[11px] text-on-surface-variant">
                        {issue.detail}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-on-surface-variant">
                      {issue.fix ? (
                        <span className="flex items-center gap-1.5">
                          {issue.fix.label}
                          {issue.proposed !== undefined && (
                            <span className="font-mono text-[11px] text-emerald-300">
                              → {String(issue.proposed)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant/70">
                          Needs a decision, not a rule
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {issue.fix && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setPending({
                                  op: issue.fix!.op,
                                  label: `${issue.fix!.label} · ${issue.column}`,
                                  issueId: issue.id,
                                })
                              }
                              title="See the change before applying it"
                              className="press cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => commit(issue.fix!.op)}
                              title={
                                issue.manual
                                  ? "A judgement call. Undo is one click away."
                                  : "Apply this fix now"
                              }
                              className="press cursor-pointer rounded-lg border border-primary/20 bg-primary/12 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                            >
                              {issue.manual ? "Fix anyway" : "Auto fix"}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => skip(issue, "one")}
                          title="Mark this finding intentional. It stops counting against the health score."
                          className="press cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          onClick={() => skip(issue, "rule")}
                          title={`Ignore every "${RULE_LABELS[issue.rule]}" finding in this dataset`}
                          aria-label={`Ignore every ${RULE_LABELS[issue.rule]} finding`}
                          className="press flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-lg border border-white/10 text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
                        >
                          <Ban className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + ISSUE_PAGE * 2)}
              className="press w-full cursor-pointer border-t border-white/[0.06] py-2.5 text-[12px] text-on-surface-variant hover:bg-white/[0.03] hover:text-on-surface"
            >
              Show more ({(filtered.length - shown).toLocaleString("en-US")} remaining)
            </button>
          )}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-on-surface-variant">
              No issues match that filter.
            </p>
          )}
        </div>
      )}

      {/* ── What has been waved through ── */}
      {skips.length > 0 && (
        <div className="nexora-card p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h3 className="text-[13px] font-semibold text-white">Marked intentional</h3>
            <span className="text-[11px] text-on-surface-variant">
              excluded from the health score
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skips.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => unskipDiagnostic(dataset.id, key)}
                title="Put this back under review"
                className="press inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-on-surface-variant hover:border-white/20 hover:text-on-surface"
              >
                {skipLabel(key)}
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── The data itself ── */}
      <DataGrid
        dataset={dataset}
        issues={gridIssues}
        diff={diff}
        focusRow={focusRow}
        onSelectCell={(rowIndex) => setFocusRow(rowIndex)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`press cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-white/10 bg-white/[0.03] text-on-surface-variant hover:bg-white/[0.07] hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}
