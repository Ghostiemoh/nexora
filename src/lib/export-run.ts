"use client";

/* Running an export.
 *
 * Everything here needs the live page — an SVG to serialize, a canvas to
 * rasterize on — so it is deliberately the only export module that touches the
 * DOM. The formats it writes, the files inside them, and the tables behind the
 * pictures all come from the tested modules beside it; this one just decides
 * which of them to call and hands back a blob. */

import * as XLSX from "xlsx";
import type { Dataset, Row } from "./types";
import type { ChartConfig, ChartSeries } from "./chart-recommend";
import type { DashboardLayout } from "./dashboard";
import { buildBiDashboard } from "./bi-model";
import { buildPowerBiFiles } from "./export-powerbi";
import { buildTableauFiles } from "./export-tableau";
import { zipToBlob } from "./zip";
import { datasetToWorkbook } from "./export-xlsx";
import {
  findChartSvg,
  matrixToSvg,
  rasterizeSvg,
  readSvgSize,
  seriesToTable,
  serializeSvgElement,
  svgToBlob,
  tableToCsv,
  EXPORT_BACKGROUND,
} from "./export-chart";
import { blobToPdfImage, pdfToBlob, type PdfPage } from "./export-pdf";
import { exportFilename, formatSpec, type ExportFormat } from "./export-formats";

/** One chart as the page currently has it: its config, its computed series, and
 *  the element it is drawn into. */
export interface ChartCapture {
  id: string;
  title: string;
  subtitle?: string;
  config: ChartConfig;
  series: ChartSeries | null;
  /** the container the chart renders inside; null when it is off screen */
  element: HTMLElement | null;
}

export interface ExportRequest {
  format: ExportFormat;
  dataset: Dataset;
  layout: DashboardLayout;
  /** the charts to export, in reading order */
  charts: ChartCapture[];
  /** the rows currently visible, after filters */
  rows: Row[];
  /** filter selections, exported as slicers where the format supports them */
  selections: Record<string, string[]>;
  /** ship the underlying table alongside the visuals */
  includeData: boolean;
  /** carry filter state into formats that can hold it */
  includeFilters: boolean;
  /** a readable summary of the active filters, used as a caption */
  filterCaption?: string;
  /** distinguishes a single-chart export from a dashboard one in the filename */
  suffix?: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  /** kept for text formats so History can re-offer the download */
  content?: string;
}

/** Excel worksheet names are capped at 31 characters and cannot hold []:*?/\ */
export function safeSheetName(title: string, fallback: string, taken: Set<string>): string {
  const cleaned = title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || fallback;
  if (!taken.has(cleaned)) {
    taken.add(cleaned);
    return cleaned;
  }
  for (let i = 2; i < 100; i++) {
    const candidate = `${cleaned.slice(0, 31 - String(i).length - 1)} ${i}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  taken.add(fallback);
  return fallback;
}

/** The SVG for one chart. A heatmap is an HTML table on screen, so it is drawn
 *  as a real SVG here rather than being skipped. */
function chartSvg(chart: ChartCapture, withTitle: boolean): string | null {
  if (chart.series?.shape === "matrix") {
    return matrixToSvg(chart.series, { title: withTitle ? chart.title : undefined });
  }
  const svg = findChartSvg(chart.element);
  if (!svg) return null;
  return serializeSvgElement(svg, { title: withTitle ? chart.title : undefined });
}

/** Stack several rasterized charts into one tall image, two across, so a
 *  dashboard PNG reads like the dashboard rather than one lucky panel. */
async function composeDashboardPng(charts: ChartCapture[]): Promise<Blob> {
  const rendered: { image: HTMLImageElement; width: number; height: number }[] = [];

  for (const chart of charts) {
    const svg = chartSvg(chart, true);
    if (!svg) continue;
    const size = readSvgSize(svg);
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("A chart could not be rendered for export."));
    });
    rendered.push({ image, ...size });
  }

  if (rendered.length === 0) {
    throw new Error("None of the charts on this dashboard could be captured.");
  }

  const scale = 2;
  const gap = 16;
  const columns = rendered.length > 1 ? 2 : 1;
  const cellWidth = Math.max(...rendered.map((r) => r.width));
  const rowHeights: number[] = [];
  for (let i = 0; i < rendered.length; i += columns) {
    rowHeights.push(Math.max(...rendered.slice(i, i + columns).map((r) => r.height)));
  }

  const width = columns * cellWidth + (columns + 1) * gap;
  const height = rowHeights.reduce((sum, h) => sum + h + gap, gap);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser did not provide a 2D canvas for export.");

  ctx.scale(scale, scale);
  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  let y = gap;
  rendered.forEach((item, i) => {
    const column = i % columns;
    if (i > 0 && column === 0) y += rowHeights[Math.floor(i / columns) - 1] + gap;
    ctx.drawImage(item.image, gap + column * (cellWidth + gap), y, item.width, item.height);
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded."))),
      "image/png"
    );
  });
}

/** Every chart's numbers, stacked into one CSV with a heading per block. */
function chartsToCsv(charts: ChartCapture[]): string {
  const blocks: string[] = [];
  for (const chart of charts) {
    if (!chart.series) continue;
    blocks.push(`# ${chart.title}`);
    blocks.push(tableToCsv(seriesToTable(chart.config, chart.series)));
    blocks.push("");
  }
  return blocks.join("\n").trimEnd();
}

/** Run an export and hand back the file. */
export async function runExport(request: ExportRequest): Promise<ExportResult> {
  const { format, dataset, charts } = request;
  const filename = exportFilename(dataset.name, format, request.suffix);

  if (format === "csv") {
    const csv = chartsToCsv(charts);
    if (!csv) throw new Error("There is nothing to export: no chart has any values to plot.");
    return { blob: new Blob([csv], { type: "text/csv;charset=utf-8" }), filename, content: csv };
  }

  if (format === "xlsx") {
    const workbook = request.includeData
      ? datasetToWorkbook(dataset)
      : XLSX.utils.book_new();

    const taken = new Set<string>(workbook.SheetNames);
    charts.forEach((chart, i) => {
      if (!chart.series) return;
      const table = seriesToTable(chart.config, chart.series);
      const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
      sheet["!cols"] = table.headers.map(() => ({ wch: 20 }));
      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        safeSheetName(chart.title, `Chart ${i + 1}`, taken)
      );
    });

    if (workbook.SheetNames.length === 0) {
      throw new Error("There is nothing to export: no chart has any values to plot.");
    }

    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    return {
      blob: new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename,
    };
  }

  if (format === "svg") {
    const svg = chartSvg(charts[0], true);
    if (!svg) throw new Error("That chart could not be captured. Scroll it into view and retry.");
    return { blob: svgToBlob(svg), filename, content: svg };
  }

  if (format === "png") {
    if (charts.length === 1) {
      const svg = chartSvg(charts[0], true);
      if (!svg) throw new Error("That chart could not be captured. Scroll it into view and retry.");
      return { blob: await rasterizeSvg(svg, { scale: 2 }), filename };
    }
    return { blob: await composeDashboardPng(charts), filename };
  }

  if (format === "pdf") {
    const pages: PdfPage[] = [];
    const footer = `Generated by Nexora from ${dataset.name} · ${request.rows.length.toLocaleString("en-US")} row(s)`;

    for (const chart of charts) {
      const svg = chartSvg(chart, false);
      if (!svg) continue;
      // JPEG rides into the PDF untouched as a DCTDecode stream.
      const jpeg = await rasterizeSvg(svg, { scale: 2, type: "image/jpeg", quality: 0.92 });
      pages.push({
        title: chart.title,
        subtitle: [chart.subtitle, request.filterCaption].filter(Boolean).join(" · ") || undefined,
        image: await blobToPdfImage(jpeg),
        footer,
      });
    }

    if (pages.length === 0) {
      throw new Error("None of the charts could be captured for the PDF.");
    }
    return { blob: pdfToBlob({ title: dataset.name, pages }), filename };
  }

  // Power BI and Tableau both describe the same dashboard, then write their own
  // container around it.
  const dash = buildBiDashboard(dataset, request.layout, {
    rows: request.rows,
    selections: request.includeFilters ? request.selections : {},
    onlyVisuals: charts.map((c) => c.id),
    pinned: [],
    includeData: request.includeData,
  });

  // A single-chart export still has to describe that chart, even when it was
  // built in the studio rather than generated into the layout.
  if (dash.visuals.length === 0 && charts.length > 0) {
    dash.visuals = charts.map((chart, i) => ({
      id: chart.id,
      title: chart.title,
      subtitle: chart.subtitle ?? "",
      type: chart.config.type,
      x: chart.config.x,
      y: chart.config.y,
      series: chart.config.series ?? null,
      agg: chart.config.agg,
      layout: { x: 12, y: 12 + i * 262, width: 1256, height: 250 },
    }));
  }

  const entries = format === "powerbi" ? buildPowerBiFiles(dash) : buildTableauFiles(dash);
  const blob = zipToBlob(entries);

  return {
    blob,
    // A .twbx is a zip; naming it so means Tableau opens it on a double click.
    filename: format === "tableau" ? filename : exportFilename(dataset.name, format, request.suffix),
  };
}

/** Hand a blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** A one-line description of what a finished export contains, for the toast. */
export function describeExport(format: ExportFormat, chartCount: number): string {
  const spec = formatSpec(format);
  const charts = `${chartCount} chart${chartCount === 1 ? "" : "s"}`;
  return spec.dynamic
    ? `${charts} exported as an editable ${spec.label} project.`
    : `${charts} exported to ${spec.label}.`;
}
