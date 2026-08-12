"use client";

/* The export control that sits on every chart.
 *
 * Each row says what the format is for, not just what it is called, because
 * "SVG" tells you nothing about whether it is the right choice. The two that
 * stay editable in another tool are marked as such and sit at the bottom under
 * their own heading, since they are a different kind of decision from "save me
 * a picture". */

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Shapes,
  Table,
  type LucideIcon,
} from "lucide-react";
import type { Dataset } from "@/lib/types";
import type { ChartConfig, ChartSeries } from "@/lib/chart-recommend";
import type { DashboardLayout } from "@/lib/dashboard";
import { useNexora } from "@/lib/store";
import { CHART_FORMATS, historyKind, type ExportFormat } from "@/lib/export-formats";
import { downloadBlob, runExport } from "@/lib/export-run";
import { Z_POPOVER } from "@/components/layout/layers";

const FORMAT_ICON: Record<ExportFormat, LucideIcon> = {
  png: FileImage,
  svg: Shapes,
  csv: Table,
  xlsx: FileSpreadsheet,
  pdf: FileText,
  powerbi: Download,
  tableau: Download,
};

export interface ChartExportMenuProps {
  dataset: Dataset;
  layout: DashboardLayout;
  chartId: string;
  title: string;
  subtitle?: string;
  config: ChartConfig;
  series: ChartSeries | null;
  /** the element the chart draws inside, needed for the image formats */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** the rows behind this chart right now */
  rows: Dataset["rows"];
  selections?: Record<string, string[]>;
}

export function ChartExportMenu({
  dataset,
  layout,
  chartId,
  title,
  subtitle,
  config,
  series,
  containerRef,
  rows,
  selections = {},
}: ChartExportMenuProps) {
  const recordExport = useNexora((s) => s.recordExport);
  const notify = useNexora((s) => s.notify);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [done, setDone] = useState<ExportFormat | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleExport = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const result = await runExport({
        format,
        dataset,
        layout,
        charts: [
          { id: chartId, title, subtitle, config, series, element: containerRef.current },
        ],
        rows,
        selections,
        includeData: true,
        includeFilters: true,
        suffix: title,
      });

      downloadBlob(result.blob, result.filename);
      recordExport({
        kind: historyKind(format),
        filename: result.filename,
        datasetId: dataset.id,
        datasetName: dataset.name,
        content: result.content,
      });

      setDone(format);
      window.setTimeout(() => setDone(null), 1600);
      setOpen(false);
    } catch (error) {
      notify(
        "error",
        "Export failed",
        error instanceof Error ? error.message : "That chart could not be exported."
      );
    } finally {
      setBusy(null);
    }
  };

  const still = CHART_FORMATS.filter((f) => !f.dynamic);
  const live = CHART_FORMATS.filter((f) => f.dynamic);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!series}
        aria-expanded={open}
        aria-haspopup="menu"
        title={series ? `Export this chart: ${title}` : "Nothing to export: this chart has no values"}
        aria-label={`Export chart: ${title}`}
        className="press flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30"
      >
        {done ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        ) : busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`menu-panel absolute right-0 top-10 ${Z_POPOVER} w-[264px] overflow-hidden rounded-xl p-1`}
        >
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
            Save a copy
          </p>
          {still.map((format) => {
            const Icon = FORMAT_ICON[format.id];
            return (
              <button
                key={format.id}
                type="button"
                role="menuitem"
                disabled={busy !== null}
                onClick={() => handleExport(format.id)}
                className="press flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-40"
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-on-surface">{format.label}</span>
                  <span className="block text-[10.5px] leading-snug text-on-surface-variant">
                    {format.summary}
                  </span>
                </span>
              </button>
            );
          })}

          <p className="mt-1 border-t border-white/[0.06] px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
            Keep working on it elsewhere
          </p>
          {live.map((format) => {
            const Icon = FORMAT_ICON[format.id];
            return (
              <button
                key={format.id}
                type="button"
                role="menuitem"
                disabled={busy !== null}
                onClick={() => handleExport(format.id)}
                className="press flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-40"
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-on-surface">{format.label}</span>
                  <span className="block text-[10.5px] leading-snug text-on-surface-variant">
                    {format.summary}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
