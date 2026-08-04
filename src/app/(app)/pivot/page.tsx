"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Table2 } from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { WorkspaceEmpty } from "@/components/layout/workspace-empty";
import { buildPivot, pivotToCsv, TOTAL_COLUMN } from "@/lib/pivot";
import { columnRoles, AGGREGATIONS, type Aggregation } from "@/lib/chart-recommend";
import { fmtAxis } from "@/components/chart-renderer";
import { triggerDownload } from "@/lib/export-docx";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const NONE = "__none__";

export default function PivotPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const recordExport = useNexora((s) => s.recordExport);
  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  const roles = useMemo(
    () => (activeDataset ? columnRoles(activeDataset) : { measures: [], dimensions: [], dates: [] }),
    [activeDataset]
  );

  // Fields worth grouping by: the category-like columns, plus dates.
  const groupable = useMemo(
    () => [...roles.dimensions, ...roles.dates],
    [roles.dimensions, roles.dates]
  );

  const [rowField, setRowField] = useState<string | null>(null);
  const [colField, setColField] = useState<string | null>(null);
  const [measure, setMeasure] = useState<string | null>(null);
  const [agg, setAgg] = useState<Aggregation>("sum");
  const [prevDatasetId, setPrevDatasetId] = useState<string | null>(activeDataset?.id ?? null);

  // A new dataset gets its own sensible defaults instead of inheriting fields
  // that may not exist here.
  if (activeDataset && activeDataset.id !== prevDatasetId) {
    setPrevDatasetId(activeDataset.id);
    setRowField(null);
    setColField(null);
    setMeasure(null);
    setAgg("sum");
  }

  const effectiveRow = rowField ?? groupable[0] ?? null;
  const effectiveCol = colField;
  const effectiveMeasure = measure ?? roles.measures[0] ?? null;

  const pivot = useMemo(() => {
    if (!activeDataset || !effectiveRow) return null;
    return buildPivot(activeDataset.rows, {
      rowField: effectiveRow,
      colField: effectiveCol,
      measure: effectiveMeasure,
      agg: effectiveMeasure === null ? "count" : agg,
    });
  }, [activeDataset, effectiveRow, effectiveCol, effectiveMeasure, agg]);

  if (!mounted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1440px] items-center justify-center p-8">
        <p className="font-mono text-xs text-on-surface-variant">Loading the pivot engine…</p>
      </div>
    );
  }

  if (!activeDataset) {
    return (
      <WorkspaceEmpty
        icon={Table2}
        title="Nothing to pivot yet"
        body="Cross-tabulate any two fields, aggregate a measure, and read the totals both ways. Choose a dataset to start."
      />
    );
  }

  const handleExport = () => {
    if (!pivot || !effectiveRow) return;
    const csv = pivotToCsv(pivot, effectiveRow);
    const filename = `${activeDataset.name.replace(/\.[^/.]+$/, "")}_pivot.csv`;
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
    recordExport({
      kind: "csv",
      filename,
      datasetId: activeDataset.id,
      datasetName: activeDataset.name,
      content: csv,
    });
  };

  // With no column field there is a single value column, so a Total column
  // beside it would just repeat every number.
  const showRowTotals = pivot !== null && pivot.colKeys.length > 1;

  const cellShade = (value: number | null) => {
    if (value === null || !pivot) return undefined;
    const values = pivot.cells.flat().filter((v): v is number => v !== null);
    if (values.length === 0) return undefined;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min;
    const t = span === 0 ? 0.5 : (value - min) / span;
    return `color-mix(in oklab, var(--primary) ${Math.round(t * 22 + 3)}%, transparent)`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="mx-auto max-w-[1440px] space-y-6 p-4 sm:p-6 md:p-8"
    >
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-1.5 flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-white md:text-[28px]">
            <Table2 className="h-6 w-6 text-primary" aria-hidden="true" />
            Pivot Table
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            Cross-tabulating
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {activeDataset.name}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!pivot}
          className="pill h-10 border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08] disabled:opacity-40"
        >
          <Download className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Field pickers */}
      <div className="nexora-card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Rows">
          <select
            value={effectiveRow ?? NONE}
            onChange={(e) => setRowField(e.target.value === NONE ? null : e.target.value)}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary/50"
          >
            {groupable.length === 0 && (
              <option value={NONE} className="bg-surface-container">
                No groupable column
              </option>
            )}
            {groupable.map((c) => (
              <option key={c} value={c} className="bg-surface-container">
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Columns">
          <select
            value={effectiveCol ?? NONE}
            onChange={(e) => setColField(e.target.value === NONE ? null : e.target.value)}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary/50"
          >
            <option value={NONE} className="bg-surface-container">
              None (totals only)
            </option>
            {groupable
              .filter((c) => c !== effectiveRow)
              .map((c) => (
                <option key={c} value={c} className="bg-surface-container">
                  {c}
                </option>
              ))}
          </select>
        </Field>

        <Field label="Values">
          <select
            value={effectiveMeasure ?? NONE}
            onChange={(e) => setMeasure(e.target.value === NONE ? null : e.target.value)}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary/50"
          >
            <option value={NONE} className="bg-surface-container">
              Count of rows
            </option>
            {roles.measures.map((c) => (
              <option key={c} value={c} className="bg-surface-container">
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Summarize by">
          <select
            value={effectiveMeasure === null ? "count" : agg}
            disabled={effectiveMeasure === null}
            onChange={(e) => setAgg(e.target.value as Aggregation)}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {AGGREGATIONS.map((a) => (
              <option key={a} value={a} className="bg-surface-container">
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {pivot === null || effectiveRow === null ? (
        <div className="nexora-card p-12 text-center text-sm text-on-surface-variant">
          This dataset has no column with repeating values to group by. A pivot needs at least one
          category or date column.
        </div>
      ) : (
        <div className="nexora-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
            <p className="text-[13px] font-semibold text-white">{pivot.valueLabel}</p>
            <p className="font-mono text-[11px] text-on-surface-variant">
              {pivot.rowKeys.length} row group{pivot.rowKeys.length === 1 ? "" : "s"} ×{" "}
              {pivot.colKeys.length} column{pivot.colKeys.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-surface-container-low">
                <tr className="border-b border-white/[0.06] text-on-surface-variant">
                  <th className="sticky left-0 z-20 bg-surface-container-low p-3 text-[11px] font-medium">
                    {effectiveRow}
                  </th>
                  {pivot.colKeys.map((c) => (
                    <th key={c} className="p-3 text-right text-[11px] font-medium" title={c}>
                      {c === TOTAL_COLUMN ? "Value" : c}
                    </th>
                  ))}
                  {showRowTotals && (
                    <th className="p-3 text-right text-[11px] font-semibold text-primary">Total</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono text-on-surface-variant">
                {pivot.rowKeys.map((rk, ri) => (
                  <tr key={rk} className="transition-colors hover:bg-white/[0.02]">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[220px] truncate bg-surface-container-low p-3 text-left font-medium text-white"
                      title={rk}
                    >
                      {rk}
                    </th>
                    {pivot.cells[ri].map((value, ci) => (
                      <td
                        key={ci}
                        className="p-3 text-right tabular-nums"
                        style={{ backgroundColor: cellShade(value) }}
                      >
                        {value === null ? (
                          <span className="text-on-surface-variant/30">—</span>
                        ) : (
                          fmtAxis(value)
                        )}
                      </td>
                    ))}
                    {showRowTotals && (
                      <td className="p-3 text-right font-semibold tabular-nums text-white">
                        {fmtAxis(pivot.rowTotals[ri])}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.03] font-mono text-white">
                  <th className="sticky left-0 z-10 bg-surface-container p-3 text-left text-[11px] font-semibold">
                    Total
                  </th>
                  {pivot.colTotals.map((total, ci) => (
                    <td key={ci} className="p-3 text-right font-semibold tabular-nums">
                      {fmtAxis(total)}
                    </td>
                  ))}
                  {showRowTotals && (
                    <td className="p-3 text-right font-semibold tabular-nums text-primary">
                      {fmtAxis(pivot.grandTotal)}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-white/[0.06] px-4 py-2.5 font-mono text-[10.5px] text-on-surface-variant/70">
            Totals are recomputed from the source rows, so an average of averages can never appear.
            Blank cells mean no rows match that combination.
          </p>
        </div>
      )}
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}
