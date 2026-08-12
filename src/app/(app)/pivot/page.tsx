"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Table2, X } from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { WorkspaceEmpty } from "@/components/layout/workspace-empty";
import { NextStep } from "@/components/layout/next-step";
import { TruncationBanner } from "@/components/truncation-banner";
import { FieldChip, Shelf, AggPicker } from "@/components/pivot/field-shelf";
import { PivotGridView } from "@/components/pivot/pivot-grid";
import {
  buildPivotGrid,
  drillPivot,
  pivotGridToCsv,
  pivotToMatrix,
  type PivotFilter,
  type PivotValue,
} from "@/lib/pivot";
import { columnRoles, type Aggregation } from "@/lib/chart-recommend";
import { triggerDownload } from "@/lib/export-docx";
import { valueCounts } from "@/lib/auto-dashboard";
import type { Row } from "@/lib/types";
import { PAGE_CENTERED, PAGE_WIDE } from "@/components/layout/page-shell";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const DRILL_CAP = 200;

interface Drill {
  rowPath: string[] | null;
  colPath: string[] | null;
  label: string;
}

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
  const groupable = useMemo(
    () => [...roles.dimensions, ...roles.dates],
    [roles.dimensions, roles.dates]
  );

  const [rowFields, setRowFields] = useState<string[]>([]);
  const [colFields, setColFields] = useState<string[]>([]);
  const [values, setValues] = useState<PivotValue[]>([]);
  const [filters, setFilters] = useState<PivotFilter[]>([]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [prevDatasetId, setPrevDatasetId] = useState<string | null>(null);

  /* A new dataset gets its own opening layout rather than inheriting fields
   * that may not exist in it: one dimension down the side, one measure summed,
   * which is the pivot everyone builds first anyway. */
  if (activeDataset && activeDataset.id !== prevDatasetId) {
    setPrevDatasetId(activeDataset.id);
    const firstDimension = [...roles.dimensions, ...roles.dates][0];
    setRowFields(firstDimension ? [firstDimension] : []);
    setColFields([]);
    setValues(
      roles.measures[0]
        ? [{ field: roles.measures[0], agg: "sum" }]
        : [{ field: null, agg: "count" }]
    );
    setFilters([]);
    setDrill(null);
  }

  const spec = useMemo(
    () => ({ rowFields, colFields, values, filters }),
    [rowFields, colFields, values, filters]
  );

  const grid = useMemo(
    () => (activeDataset ? buildPivotGrid(activeDataset.rows, spec) : null),
    [activeDataset, spec]
  );

  const drillRows = useMemo<Row[]>(() => {
    if (!activeDataset || !drill) return [];
    return drillPivot(activeDataset.rows, spec, drill.rowPath, drill.colPath);
  }, [activeDataset, spec, drill]);

  if (!mounted) {
    return (
      <div className={PAGE_CENTERED}>
        <p className="font-mono text-xs text-on-surface-variant">Loading the pivot engine…</p>
      </div>
    );
  }

  if (!activeDataset || !grid) {
    return (
      <WorkspaceEmpty
        icon={Table2}
        title="Nothing to pivot yet"
        body="Drag fields onto rows, columns, and values to summarize a dataset the way you would in Excel, then drill into any number to see the records behind it. Choose a dataset to start."
      />
    );
  }

  const used = new Set([...rowFields, ...colFields, ...filters.map((f) => f.field)]);
  const dataset = activeDataset;
  const baseName = dataset.name.replace(/\.[^/.]+$/, "");

  const addValue = (field: string) => {
    if (values.some((v) => v.field === field)) return;
    setValues([...values, { field, agg: "sum" }]);
  };

  const reorder = (list: string[], from: number, to: number) => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const handleExportCsv = () => {
    const csv = pivotGridToCsv(grid);
    const filename = `${baseName}_pivot.csv`;
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
    recordExport({
      kind: "csv",
      filename,
      datasetId: dataset.id,
      datasetName: dataset.name,
      content: csv,
    });
  };

  const handleExportXlsx = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(pivotToMatrix(grid));
    sheet["!cols"] = [{ wch: 24 }, ...grid.colKeys.flatMap(() => grid.values.map(() => ({ wch: 14 })))];
    XLSX.utils.book_append_sheet(workbook, sheet, "Pivot");

    const filename = `${baseName}_pivot.xlsx`;
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    triggerDownload(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename
    );
    recordExport({ kind: "xlsx", filename, datasetId: dataset.id, datasetName: dataset.name });
  };

  const handleExportDrill = () => {
    if (drillRows.length === 0) return;
    const header = dataset.columns.join(",");
    const body = drillRows
      .map((row) =>
        dataset.columns
          .map((c) => {
            const raw = row[c] === null || row[c] === undefined ? "" : String(row[c]);
            return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
          })
          .join(",")
      )
      .join("\n");
    const csv = `${header}\n${body}`;
    const filename = `${baseName}_drilldown.csv`;
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
    recordExport({
      kind: "csv",
      filename,
      datasetId: dataset.id,
      datasetName: dataset.name,
      content: csv,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className={`${PAGE_WIDE} space-y-6`}
    >
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-on-surface-variant">
            <Table2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Step 2 · Summarize
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-white md:text-[28px]">
            Pivot Tables
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            Cross-tabulating
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {dataset.name}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="pill h-10 cursor-pointer border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08]"
          >
            <Download className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
            CSV
          </button>
          <button
            type="button"
            onClick={handleExportXlsx}
            className="pill h-10 cursor-pointer border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08]"
          >
            <FileSpreadsheet className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
            Excel
          </button>
        </div>
      </div>

      {dataset.truncated && <TruncationBanner rows={dataset.rows.length} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* ── Field list and shelves ── */}
        <div className="space-y-3 xl:col-span-3">
          <div className="nexora-card p-3">
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Fields
            </h2>
            <p className="mb-2.5 text-[10.5px] leading-snug text-on-surface-variant/70">
              Drag onto a shelf, or use each shelf&apos;s menu.
            </p>
            <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto pr-0.5">
              {roles.measures.map((field) => (
                <FieldChip
                  key={field}
                  field={field}
                  kind="measure"
                  onAdd={() => addValue(field)}
                />
              ))}
              {roles.dates.map((field) => (
                <FieldChip
                  key={field}
                  field={field}
                  kind="date"
                  onAdd={() => !used.has(field) && setRowFields([...rowFields, field])}
                />
              ))}
              {roles.dimensions.map((field) => (
                <FieldChip
                  key={field}
                  field={field}
                  kind="dimension"
                  onAdd={() => !used.has(field) && setRowFields([...rowFields, field])}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
            <Shelf
              label="Filters"
              hint="Drop a field here to narrow what the pivot counts."
              fields={filters.map((f) => f.field)}
              available={groupable.filter((f) => !filters.some((x) => x.field === f))}
              onAdd={(field) => setFilters([...filters, { field, values: [] }])}
              onRemove={(field) => setFilters(filters.filter((f) => f.field !== field))}
            />

            <Shelf
              label="Columns"
              hint="Drop a field here to spread values across the top."
              fields={colFields}
              available={groupable.filter((f) => !used.has(f))}
              onAdd={(field) => setColFields([...colFields, field])}
              onRemove={(field) => setColFields(colFields.filter((f) => f !== field))}
              onReorder={(from, to) => setColFields(reorder(colFields, from, to))}
            />

            <Shelf
              label="Rows"
              hint="Drop a field here to group down the side."
              fields={rowFields}
              available={groupable.filter((f) => !used.has(f))}
              onAdd={(field) => setRowFields([...rowFields, field])}
              onRemove={(field) => setRowFields(rowFields.filter((f) => f !== field))}
              onReorder={(from, to) => setRowFields(reorder(rowFields, from, to))}
            />

            <Shelf
              label="Values"
              hint="Drop a numeric field here. With none, the pivot counts rows."
              fields={values.map((v) => v.field ?? "Count of rows")}
              available={roles.measures.filter((m) => !values.some((v) => v.field === m))}
              onAdd={addValue}
              onRemove={(field) =>
                setValues(values.filter((v) => (v.field ?? "Count of rows") !== field))
              }
              onReorder={(from, to) => {
                const next = [...values];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                setValues(next);
              }}
              renderExtra={(_, index) => (
                <AggPicker
                  value={values[index]}
                  onChange={(agg: Aggregation) =>
                    setValues(values.map((v, i) => (i === index ? { ...v, agg } : v)))
                  }
                />
              )}
            />
          </div>
        </div>

        {/* ── The grid ── */}
        <div className="space-y-3 xl:col-span-9">
          {/* Filter values, once a filter field is on the shelf */}
          {filters.length > 0 && (
            <div className="nexora-card flex flex-wrap gap-3 p-3">
              {filters.map((filter) => {
                const options = valueCounts(dataset.rows, filter.field)
                  .slice(0, 40)
                  .map((v) => v.name);
                return (
                  <div key={filter.field} className="min-w-[180px] flex-1">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                      {filter.field}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {options.map((option) => {
                        const on = filter.values.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setFilters(
                                filters.map((f) =>
                                  f.field === filter.field
                                    ? {
                                        ...f,
                                        values: on
                                          ? f.values.filter((v) => v !== option)
                                          : [...f.values, option],
                                      }
                                    : f
                                )
                              )
                            }
                            className={`press cursor-pointer rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                              on
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-white/10 bg-white/[0.03] text-on-surface-variant hover:bg-white/[0.07]"
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rowFields.length === 0 && colFields.length === 0 ? (
            <div className="nexora-card p-12 text-center text-sm text-on-surface-variant">
              Put a field on Rows or Columns to build the pivot. Everything on this page reads from
              the cleaned data, so fix issues in Dataset Doctor first if the totals look wrong.
            </div>
          ) : (
            <div className="nexora-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
                <p className="text-[13px] font-semibold text-white">
                  {grid.valueLabels.join(" · ")}
                </p>
                <p className="font-mono text-[11px] text-on-surface-variant">
                  {grid.rowKeys.length} row group{grid.rowKeys.length === 1 ? "" : "s"} ×{" "}
                  {grid.colKeys.length} column{grid.colKeys.length === 1 ? "" : "s"}
                  <span className="mx-2 opacity-40">·</span>
                  {grid.matchedRows.toLocaleString("en-US")} of{" "}
                  {dataset.rows.length.toLocaleString("en-US")} rows
                </p>
              </div>

              <PivotGridView
                grid={grid}
                onDrill={(rowPath, colPath, label) => setDrill({ rowPath, colPath, label })}
              />

              <p className="border-t border-white/[0.06] px-4 py-2.5 font-mono text-[10.5px] text-on-surface-variant/70">
                Totals are recomputed from the source rows, so an average of averages can never
                appear. Click any number to see the records behind it.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Drill-down ── */}
      {drill && (
        <div className="nexora-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">{drill.label}</p>
              <p className="mt-0.5 font-mono text-[11px] text-on-surface-variant">
                {drillRows.length.toLocaleString("en-US")} row
                {drillRows.length === 1 ? "" : "s"} behind this number
                {drillRows.length > DRILL_CAP && ` · first ${DRILL_CAP} shown`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleExportDrill}
                className="pill h-9 cursor-pointer border border-white/10 bg-white/5 px-3 text-[12.5px] text-on-surface hover:bg-white/[0.08]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export these rows
              </button>
              <button
                type="button"
                onClick={() => setDrill(null)}
                aria-label="Close the drill-down"
                className="press flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full border-collapse text-left font-mono text-[11.5px]">
              <thead className="sticky top-0 bg-surface-container-low">
                <tr className="border-b border-white/[0.06] text-on-surface-variant">
                  {dataset.columns.map((column) => (
                    <th key={column} className="whitespace-nowrap p-2.5 text-[10.5px] font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-on-surface-variant">
                {drillRows.slice(0, DRILL_CAP).map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    {dataset.columns.map((column) => (
                      <td key={column} className="max-w-[220px] truncate p-2.5">
                        {row[column] === null || row[column] === undefined ? (
                          <span className="text-on-surface-variant/25">empty</span>
                        ) : (
                          String(row[column])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NextStep note="The numbers are summarized. Next, turn them into the picture: KPIs, trends, and breakdowns." />
    </motion.div>
  );
}
