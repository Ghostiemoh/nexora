/* The export catalogue.
 *
 * One list of what Nexora can write, what each format actually preserves, and
 * which of them make sense for a single chart versus a whole dashboard. The
 * options dialog, the per-chart menu, and the history log all read this, so a
 * format can never be offered in one place and missing in another — and the
 * promise made next to a button is the promise the writer keeps.
 *
 * No claim in `preserves` is aspirational. If a format cannot carry filters,
 * it says so. */

export type ExportFormat =
  | "xlsx"
  | "csv"
  | "pdf"
  | "png"
  | "svg"
  | "powerbi"
  | "tableau";

export interface ExportFormatSpec {
  id: ExportFormat;
  label: string;
  /** file extension the download lands with */
  extension: string;
  /** one line on what this format is for */
  summary: string;
  /** true when the result stays editable in the destination tool */
  dynamic: boolean;
  /** what genuinely survives the trip */
  preserves: string[];
  /** what does not, stated rather than left to be discovered */
  omits: string[];
  /** offered for a single chart */
  chart: boolean;
  /** offered for the whole dashboard */
  dashboard: boolean;
  /** the export can carry the underlying rows */
  supportsData: boolean;
  /** the export can carry filter state */
  supportsFilters: boolean;
}

export const EXPORT_FORMATS: ExportFormatSpec[] = [
  {
    id: "powerbi",
    label: "Power BI",
    extension: "zip",
    summary: "A .pbip project you keep building on in Power BI Desktop.",
    dynamic: true,
    preserves: [
      "Page layout and visual positions",
      "Chart types, fields, and aggregations",
      "DAX measures",
      "Slicers and the values you had selected",
      "Column data types",
      "Nexora's colour theme",
      "The underlying table as CSV",
    ],
    omits: [
      "Cross-filtering behaviour beyond Power BI's own defaults",
      "A binary .pbix, which no browser can write",
    ],
    chart: true,
    dashboard: true,
    supportsData: true,
    supportsFilters: true,
  },
  {
    id: "tableau",
    label: "Tableau",
    extension: "twbx",
    summary: "A packaged workbook with a worksheet per chart and a dashboard.",
    dynamic: true,
    preserves: [
      "A worksheet per chart, with marks and shelves",
      "Dashboard zones matching the on-screen layout",
      "Calculated fields for every measure",
      "Field types, dimensions, and measures",
      "Filters as dashboard filter zones",
      "The underlying table as CSV",
    ],
    omits: ["Nexora's exact chart styling, which Tableau restyles to its own defaults"],
    chart: true,
    dashboard: true,
    supportsData: true,
    supportsFilters: true,
  },
  {
    id: "xlsx",
    label: "Excel",
    extension: "xlsx",
    summary: "A workbook: one sheet per chart's numbers, plus the cleaned data.",
    dynamic: false,
    preserves: ["The numbers behind every chart", "The cleaned dataset", "The cleaning audit trail"],
    omits: ["The charts themselves, which arrive as data rather than pictures"],
    chart: true,
    dashboard: true,
    supportsData: true,
    supportsFilters: false,
  },
  {
    id: "csv",
    label: "CSV",
    extension: "csv",
    summary: "Plain text: the numbers behind the charts.",
    dynamic: false,
    preserves: ["The aggregated values behind each chart"],
    omits: ["Formatting, charts, and anything that is not a value"],
    chart: true,
    dashboard: true,
    supportsData: true,
    supportsFilters: false,
  },
  {
    id: "pdf",
    label: "PDF",
    extension: "pdf",
    summary: "A page per chart, sized for sending on.",
    dynamic: false,
    preserves: ["Every chart as it looks on screen", "Titles and the filter state as captions"],
    omits: ["Interactivity of any kind"],
    chart: true,
    dashboard: true,
    supportsData: false,
    supportsFilters: false,
  },
  {
    id: "png",
    label: "PNG",
    extension: "png",
    summary: "A raster image at twice the on-screen resolution.",
    dynamic: false,
    preserves: ["Exactly what is drawn on screen"],
    omits: ["Interactivity, and the numbers behind the picture"],
    chart: true,
    dashboard: true,
    supportsData: false,
    supportsFilters: false,
  },
  {
    id: "svg",
    label: "SVG",
    extension: "svg",
    summary: "Vector, so it stays sharp at any size.",
    dynamic: false,
    preserves: ["Exactly what is drawn on screen, as vectors"],
    omits: ["Interactivity, and the numbers behind the picture"],
    chart: true,
    dashboard: false,
    supportsData: false,
    supportsFilters: false,
  },
];

export function formatSpec(id: ExportFormat): ExportFormatSpec {
  const spec = EXPORT_FORMATS.find((f) => f.id === id);
  if (!spec) throw new Error(`Unknown export format: ${id}`);
  return spec;
}

/** The formats offered for a single chart. */
export const CHART_FORMATS = EXPORT_FORMATS.filter((f) => f.chart);
/** The formats offered for the whole dashboard. */
export const DASHBOARD_FORMATS = EXPORT_FORMATS.filter((f) => f.dashboard);

/** The history record kind a format lands under. Anything without its own kind
 *  is logged as a workspace export, which is what the history page already
 *  knows how to re-offer. */
export function historyKind(id: ExportFormat): "csv" | "xlsx" | "workspace" {
  if (id === "csv") return "csv";
  if (id === "xlsx") return "xlsx";
  return "workspace";
}

/** Build a filename that says what it is without needing the folder around it. */
export function exportFilename(base: string, format: ExportFormat, suffix?: string): string {
  const spec = formatSpec(format);
  const stem = base
    .replace(/\.[^/.]+$/, "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const middle = suffix ? `_${suffix.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40)}` : "";
  return `${stem || "nexora"}${middle}.${spec.extension}`;
}
