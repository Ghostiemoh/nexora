/* Chart export: the picture and the numbers behind it.
 *
 * Two halves, deliberately separated. Turning a chart's series into a table is
 * pure arithmetic and is unit-tested. Turning what is on screen into a PNG has
 * to read the live SVG, so it lives behind functions that take an element and
 * are only ever called from a click handler. */

import type { ChartConfig, ChartSeries } from "./chart-recommend";
import { titleize } from "./kpi";

export interface ChartTable {
  headers: string[];
  rows: (string | number)[][];
}

/** The name a chart goes by in an export: what it measures, by what. */
export function chartTitle(config: ChartConfig): string {
  const measure = config.y === null ? "Record count" : `${titleize(config.y)}`;
  if (config.x === null) return measure;
  if (config.series) return `${measure} by ${titleize(config.x)} and ${titleize(config.series)}`;
  return `${measure} by ${titleize(config.x)}`;
}

/** The numbers behind a chart, in the shape a spreadsheet wants. Every chart
 *  shape resolves to a table, because a reader who asks for the data behind a
 *  picture should never be told this particular picture has none. */
export function seriesToTable(config: ChartConfig, series: ChartSeries): ChartTable {
  const measureHeader =
    config.y === null || config.agg === "count" ? "Count" : `${config.agg} of ${config.y}`;

  if (series.shape === "scatter") {
    return {
      headers: [config.x ?? "x", config.y ?? "y"],
      rows: series.data.map((point) => [point.x, point.y]),
    };
  }

  if (series.shape === "matrix") {
    return {
      headers: [config.x ?? "row", ...series.cols],
      rows: series.rows.map((rowKey) => [
        rowKey,
        ...series.cols.map(
          (colKey) => series.cells.find((c) => c.row === rowKey && c.col === colKey)?.value ?? 0
        ),
      ]),
    };
  }

  if (series.shape === "bins") {
    return {
      headers: [`${config.x ?? config.y ?? "value"} range`, "Rows"],
      rows: series.data.map((bin) => [bin.name, bin.value]),
    };
  }

  // category and time both read as label → value.
  return {
    headers: [config.x ?? "Category", measureHeader],
    rows: series.data.map((point) => [point.name, point.value]),
  };
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tableToCsv(table: ChartTable): string {
  return [table.headers, ...table.rows].map((line) => line.map(escapeCsv).join(",")).join("\n");
}

export function seriesToCsv(config: ChartConfig, series: ChartSeries): string {
  return tableToCsv(seriesToTable(config, series));
}

/* ── SVG capture ────────────────────────────────────────────────────────
 * Recharts draws real SVG, so the highest-fidelity export is the element the
 * reader is already looking at rather than a second renderer that could drift
 * from it. The clone gets an explicit size, a background, and a font stack,
 * because an SVG that leaves the page loses the stylesheet that was styling it. */

/** The surface colour charts are drawn against, so an exported PNG is not a
 *  dark chart floating on transparency. */
export const EXPORT_BACKGROUND = "#101315";
const EXPORT_FONT =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface SvgExportOptions {
  background?: string;
  /** drawn top-left when present */
  title?: string;
}

/** Serialize a live SVG into a standalone document. */
export function serializeSvgElement(svg: SVGSVGElement, options: SvgExportOptions = {}): string {
  const background = options.background ?? EXPORT_BACKGROUND;
  const box = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width || svg.clientWidth || 640));
  const height = Math.max(1, Math.round(box.height || svg.clientHeight || 360));
  const titleHeight = options.title ? 34 : 0;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clone.style.fontFamily = EXPORT_FONT;

  const inner = new XMLSerializer().serializeToString(clone);
  const titleMarkup = options.title
    ? `<text x="16" y="23" fill="#f1f2ed" font-size="14" font-weight="600" font-family="${EXPORT_FONT}">${escapeXml(options.title)}</text>`
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height + titleHeight}" viewBox="0 0 ${width} ${height + titleHeight}">`,
    `<rect width="100%" height="100%" fill="${background}"/>`,
    titleMarkup,
    `<g transform="translate(0, ${titleHeight})">${inner}</g>`,
    `</svg>`,
  ].join("");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Render a heatmap, which is an HTML table rather than an SVG, into a real SVG
 *  so it exports through the same path as every other chart type. */
export function matrixToSvg(
  series: Extract<ChartSeries, { shape: "matrix" }>,
  options: SvgExportOptions & { palette?: string } = {}
): string {
  const background = options.background ?? EXPORT_BACKGROUND;
  const accent = options.palette ?? "#e7b856";
  const labelWidth = 140;
  const cell = { w: 78, h: 30 };
  const headerHeight = 28;
  const titleHeight = options.title ? 34 : 0;

  const width = labelWidth + series.cols.length * cell.w + 16;
  const height = titleHeight + headerHeight + series.rows.length * cell.h + 16;
  const span = series.max - series.min;

  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${background}"/>`,
  ];

  if (options.title) {
    parts.push(
      `<text x="12" y="23" fill="#f1f2ed" font-size="14" font-weight="600" font-family="${EXPORT_FONT}">${escapeXml(options.title)}</text>`
    );
  }

  series.cols.forEach((col, ci) => {
    const x = labelWidth + ci * cell.w + cell.w / 2;
    parts.push(
      `<text x="${x}" y="${titleHeight + 18}" fill="#b7bfba" font-size="10" text-anchor="middle" font-family="${EXPORT_FONT}">${escapeXml(truncate(col, 12))}</text>`
    );
  });

  series.rows.forEach((rowKey, ri) => {
    const y = titleHeight + headerHeight + ri * cell.h;
    parts.push(
      `<text x="8" y="${y + 19}" fill="#f1f2ed" font-size="10" font-family="${EXPORT_FONT}">${escapeXml(truncate(rowKey, 20))}</text>`
    );

    series.cols.forEach((col, ci) => {
      const value = series.cells.find((c) => c.row === rowKey && c.col === col)?.value ?? 0;
      const t = span === 0 ? (value > 0 ? 1 : 0) : (value - series.min) / span;
      const x = labelWidth + ci * cell.w;
      parts.push(
        `<rect x="${x + 1}" y="${y + 1}" width="${cell.w - 3}" height="${cell.h - 3}" rx="4" fill="${accent}" fill-opacity="${(t * 0.82 + 0.04).toFixed(3)}"/>`,
        `<text x="${x + cell.w / 2}" y="${y + 19}" fill="${t > 0.55 ? "#171208" : "#b7bfba"}" font-size="10" text-anchor="middle" font-family="${EXPORT_FONT}">${escapeXml(formatCompact(value))}</text>`
      );
    });
  });

  parts.push(`</svg>`);
  return parts.join("");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Number(v.toFixed(2)));
}

/** The dimensions declared on a serialized SVG document. */
export function readSvgSize(svgText: string): { width: number; height: number } {
  const width = /<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/.exec(svgText);
  const height = /<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/.exec(svgText);
  return {
    width: width ? Math.round(parseFloat(width[1])) : 640,
    height: height ? Math.round(parseFloat(height[1])) : 360,
  };
}

export function svgToBlob(svgText: string): Blob {
  return new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
}

/** Rasterize a serialized SVG. `scale` above 1 gives a retina-sharp PNG, which
 *  is what a chart pasted into a deck actually needs. */
export async function rasterizeSvg(
  svgText: string,
  options: { scale?: number; type?: "image/png" | "image/jpeg"; quality?: number } = {}
): Promise<Blob> {
  const scale = options.scale ?? 2;
  const type = options.type ?? "image/png";
  const { width, height } = readSvgSize(svgText);

  const image = new Image();
  image.width = width;
  image.height = height;
  // A data URL keeps the canvas untainted, so toBlob is allowed to read it back.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The chart could not be rendered for export."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser did not provide a 2D canvas for export.");

  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded."))),
      type,
      options.quality ?? 0.92
    );
  });
}

/** Find the SVG a chart container is drawing into. */
export function findChartSvg(container: HTMLElement | null): SVGSVGElement | null {
  return container?.querySelector("svg") ?? null;
}
