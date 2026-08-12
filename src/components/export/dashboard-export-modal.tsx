"use client";

/* Exporting the whole dashboard.
 *
 * Four decisions, in the order they actually matter: what format, which
 * visuals, whether the data rides along, and whether the filters do. Each
 * format states plainly what it preserves and what it drops, because the moment
 * to learn that a PNG has no drill-down is before the download, not after
 * opening it in front of a client. */

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckSquare,
  Download,
  Loader2,
  Square,
  X,
  Zap,
} from "lucide-react";
import type { Dataset } from "@/lib/types";
import type { DashboardLayout } from "@/lib/dashboard";
import { useNexora } from "@/lib/store";
import { DASHBOARD_FORMATS, historyKind, type ExportFormat } from "@/lib/export-formats";
import { downloadBlob, runExport, type ChartCapture } from "@/lib/export-run";
import { MODAL_BACKDROP } from "@/components/layout/layers";

export interface DashboardExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset;
  layout: DashboardLayout;
  /** reads every chart on the page, in reading order. A function rather than a
   *  list because the panels' DOM only exists once they have mounted, and a
   *  reader may have switched one to a different chart type since. */
  collectCharts: () => ChartCapture[];
  rows: Dataset["rows"];
  selections: Record<string, string[]>;
  filterCaption?: string;
}

export function DashboardExportModal({
  isOpen,
  onClose,
  dataset,
  layout,
  collectCharts,
  rows,
  selections,
  filterCaption,
}: DashboardExportModalProps) {
  const recordExport = useNexora((s) => s.recordExport);
  const notify = useNexora((s) => s.notify);

  const [format, setFormat] = useState<ExportFormat>("powerbi");
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [includeData, setIncludeData] = useState(true);
  const [includeFilters, setIncludeFilters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, busy]);

  const spec = useMemo(
    () => DASHBOARD_FORMATS.find((f) => f.id === format)!,
    [format]
  );

  // Read the page's charts once per opening; they cannot change while a modal
  // is covering them.
  const charts = useMemo(() => (isOpen ? collectCharts() : []), [isOpen, collectCharts]);

  const chosen = useMemo(
    () => (selectedIds === null ? charts : charts.filter((c) => selectedIds.includes(c.id))),
    [charts, selectedIds]
  );

  if (!isOpen) return null;

  const filterCount = Object.values(selections).filter((v) => v.length > 0).length;

  const toggleChart = (id: string) => {
    const current = selectedIds ?? charts.map((c) => c.id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setSelectedIds(next.length === charts.length ? null : next);
  };

  const isChecked = (id: string) => selectedIds === null || selectedIds.includes(id);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await runExport({
        format,
        dataset,
        layout,
        charts: chosen,
        rows,
        selections,
        includeData: includeData && spec.supportsData,
        includeFilters: includeFilters && spec.supportsFilters,
        filterCaption,
        suffix: "dashboard",
      });

      downloadBlob(result.blob, result.filename);
      recordExport({
        kind: historyKind(format),
        filename: result.filename,
        datasetId: dataset.id,
        datasetName: dataset.name,
        content: result.content,
      });
      notify(
        "success",
        "Dashboard exported",
        `${chosen.length} visual${chosen.length === 1 ? "" : "s"} written to ${result.filename}.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The export could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={MODAL_BACKDROP}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dashboard-title"
        className="nexora-card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] p-5">
          <div>
            <h2 id="export-dashboard-title" className="text-lg font-semibold tracking-tight text-white">
              Export dashboard
            </h2>
            <p className="mt-1 text-[12.5px] text-on-surface-variant">
              {charts.length} visual{charts.length === 1 ? "" : "s"} from {dataset.name}
              {filterCount > 0 && ` · ${filterCount} filter${filterCount === 1 ? "" : "s"} active`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close export options"
            className="press flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {/* ── Format ── */}
          <fieldset>
            <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Format
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DASHBOARD_FORMATS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFormat(option.id)}
                  aria-pressed={format === option.id}
                  className={`press cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                    format === option.id
                      ? "border-primary/40 bg-primary/[0.10]"
                      : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`text-[13px] font-medium ${format === option.id ? "text-primary" : "text-on-surface"}`}
                    >
                      {option.label}
                    </span>
                    {option.dynamic && (
                      <Zap className="h-3 w-3 shrink-0 text-primary" aria-label="stays editable" />
                    )}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-on-surface-variant">
                    {option.summary}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* ── What this format actually carries ── */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Comes across
                </p>
                <ul className="space-y-1">
                  {spec.preserves.map((item) => (
                    <li key={item} className="text-[11.5px] leading-snug text-on-surface-variant">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Does not
                </p>
                <ul className="space-y-1">
                  {spec.omits.map((item) => (
                    <li key={item} className="text-[11.5px] leading-snug text-on-surface-variant">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ── Scope ── */}
          <fieldset>
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                Visuals
              </legend>
              <button
                type="button"
                onClick={() => setSelectedIds(selectedIds === null ? [] : null)}
                className="cursor-pointer text-[11px] text-on-surface-variant hover:text-white"
              >
                {selectedIds === null ? "Select none" : "Select all"}
              </button>
            </div>
            <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {charts.map((chart) => (
                <button
                  key={chart.id}
                  type="button"
                  onClick={() => toggleChart(chart.id)}
                  aria-pressed={isChecked(chart.id)}
                  className="press flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-left hover:bg-white/[0.05]"
                >
                  {isChecked(chart.id) ? (
                    <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <Square className="h-3.5 w-3.5 shrink-0 text-on-surface-variant/50" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate text-[12px] text-on-surface">{chart.title}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* ── Options ── */}
          <fieldset className="space-y-1.5">
            <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Include
            </legend>
            <Toggle
              checked={includeData && spec.supportsData}
              disabled={!spec.supportsData}
              onChange={setIncludeData}
              label="The underlying dataset"
              hint={
                spec.supportsData
                  ? `${rows.length.toLocaleString("en-US")} row(s) as CSV, so the export refreshes and recalculates`
                  : `${spec.label} carries pictures only, so there is no table to attach`
              }
            />
            <Toggle
              checked={includeFilters && spec.supportsFilters}
              disabled={!spec.supportsFilters}
              onChange={setIncludeFilters}
              label="Filters and calculated fields"
              hint={
                spec.supportsFilters
                  ? "Slicers, measures, and the values currently selected"
                  : `${spec.label} cannot hold a filter, so the export is of the filtered view as it stands`
              }
            />
          </fieldset>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3 text-[12px] text-amber-200">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/[0.06] p-5">
          <p className="text-[11.5px] text-on-surface-variant">
            {chosen.length === 0
              ? "Pick at least one visual."
              : `${chosen.length} visual${chosen.length === 1 ? "" : "s"} → ${spec.label}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="pill h-10 cursor-pointer border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy || chosen.length === 0}
              className="pill h-10 cursor-pointer bg-primary px-5 text-[13px] text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Writing…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export
                </>
              )}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5 ${
        disabled ? "opacity-50" : "cursor-pointer hover:bg-white/[0.04]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-[12.5px] text-on-surface">{label}</span>
        <span className="block text-[11px] leading-snug text-on-surface-variant">{hint}</span>
      </span>
    </label>
  );
}
