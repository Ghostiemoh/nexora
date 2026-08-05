/* The platform-neutral description of a dashboard.
 *
 * Power BI and Tableau want very different files, but they want the same
 * *facts*: which fields exist and what type they are, which measures the
 * dashboard aggregates, which visuals sit where, and what is filtered. This
 * module derives that description once, from the same layout the screen is
 * drawing, so an export can never show a different dashboard than the one the
 * analyst was looking at.
 *
 * Pure logic, no UI and no file formats. */

import type { Dataset, Row } from "./types";
import type { Aggregation, ChartConfig, ChartType } from "./chart-recommend";
import type { DashboardLayout } from "./dashboard";
import { titleize } from "./kpi";
import { toCsv } from "./csv";

export type BiDataType = "string" | "number" | "date" | "boolean";

export interface BiField {
  /** the column name exactly as it appears in the data */
  name: string;
  /** a readable caption for the field list */
  caption: string;
  dataType: BiDataType;
  role: "dimension" | "measure";
}

export interface BiMeasure {
  /** the measure name as it will appear in the model, e.g. "Total Revenue" */
  name: string;
  column: string;
  agg: Aggregation;
  /** the DAX that computes it */
  dax: string;
  /** the Tableau calculation that computes it */
  tableau: string;
}

export interface BiVisual {
  id: string;
  title: string;
  subtitle: string;
  type: ChartType;
  /** category / axis field */
  x: string | null;
  /** measure field; null means "count rows" */
  y: string | null;
  /** second dimension, used by cross-tabs */
  series: string | null;
  agg: Aggregation;
  /** position on a 1280×720 report page, in points */
  layout: { x: number; y: number; width: number; height: number };
}

export interface BiSlicer {
  column: string;
  caption: string;
  values: string[];
  /** values the analyst had selected at export time */
  selected: string[];
  layout: { x: number; y: number; width: number; height: number };
}

export interface BiDashboard {
  /** file-safe name used for the project folder and workbook */
  name: string;
  /** the dataset's display name */
  datasetName: string;
  /** the table name inside the model */
  tableName: string;
  fields: BiField[];
  measures: BiMeasure[];
  visuals: BiVisual[];
  slicers: BiSlicer[];
  /** the data itself, already serialized */
  csv: string;
  rowCount: number;
  /** true when the export carries only the filtered rows */
  filtered: boolean;
  generatedAt: string;
}

/* A Power BI report page is 1280×720 by default; laying visuals out on that
 * grid means the exported report opens looking like the one on screen rather
 * than a pile of overlapping boxes in the corner. */
const PAGE = { width: 1280, height: 720 };
const SLICER_BAND = 96;
const GUTTER = 12;

/** Strip a name down to something safe in a filename and a folder. */
export function safeName(value: string): string {
  const cleaned = value
    .replace(/\.[^/.]+$/, "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned.length > 0 ? cleaned.slice(0, 60) : "Nexora_Dashboard";
}

/** Map Nexora's inferred column type onto the four types both platforms share. */
export function biDataType(type: string): BiDataType {
  if (type === "number") return "number";
  if (type === "date") return "date";
  if (type === "boolean") return "boolean";
  return "string";
}

/** The DAX aggregator behind each aggregation. */
const DAX_FUNCTION: Record<Aggregation, string> = {
  sum: "SUM",
  avg: "AVERAGE",
  min: "MIN",
  max: "MAX",
  count: "COUNTROWS",
};

const TABLEAU_FUNCTION: Record<Aggregation, string> = {
  sum: "SUM",
  avg: "AVG",
  min: "MIN",
  max: "MAX",
  count: "COUNT",
};

const AGG_PREFIX: Record<Aggregation, string> = {
  sum: "Total",
  avg: "Average",
  min: "Minimum",
  max: "Maximum",
  count: "Count of",
};

/** Name a measure the way an analyst would in the field list. */
export function measureName(column: string | null, agg: Aggregation): string {
  if (column === null || agg === "count") return "Row Count";
  return `${AGG_PREFIX[agg]} ${titleize(column)}`;
}

export function buildMeasure(table: string, column: string | null, agg: Aggregation): BiMeasure {
  if (column === null || agg === "count") {
    return {
      name: "Row Count",
      column: "*",
      agg: "count",
      dax: `Row Count = COUNTROWS('${table}')`,
      tableau: "COUNT([Number of Records])",
    };
  }
  const name = measureName(column, agg);
  return {
    name,
    column,
    agg,
    dax: `${name} = ${DAX_FUNCTION[agg]}('${table}'[${column}])`,
    tableau: `${TABLEAU_FUNCTION[agg]}([${column}])`,
  };
}

/** Lay the visuals out on a two-column grid, letting wide panels span both.
 *  The order is the dashboard's own order, so the trend still leads. */
function layoutVisuals(
  panels: { config: ChartConfig; title: string; subtitle: string; id: string; wide?: boolean }[],
  hasSlicers: boolean
): BiVisual[] {
  const top = hasSlicers ? SLICER_BAND + GUTTER : GUTTER;
  const usable = PAGE.width - GUTTER * 2;
  const half = (usable - GUTTER) / 2;
  const rowHeight = 250;

  let cursorY = top;
  let column = 0;

  return panels.map((panel) => {
    const wide = panel.wide === true;
    // A wide panel always starts a fresh row so it can span the page.
    if (wide && column === 1) {
      column = 0;
      cursorY += rowHeight + GUTTER;
    }

    const layout = {
      x: GUTTER + (wide ? 0 : column * (half + GUTTER)),
      y: cursorY,
      width: wide ? usable : half,
      height: rowHeight,
    };

    if (wide) {
      cursorY += rowHeight + GUTTER;
      column = 0;
    } else if (column === 0) {
      column = 1;
    } else {
      column = 0;
      cursorY += rowHeight + GUTTER;
    }

    return {
      id: panel.id,
      title: panel.title,
      subtitle: panel.subtitle,
      type: panel.config.type,
      x: panel.config.x,
      y: panel.config.y,
      series: panel.config.series ?? null,
      agg: panel.config.agg,
      layout,
    };
  });
}

export interface BuildBiOptions {
  /** the rows to ship; defaults to the whole dataset */
  rows?: Row[];
  /** filter selections at export time, turned into slicers */
  selections?: Record<string, string[]>;
  /** charts the analyst pinned, exported alongside the generated panels */
  pinned?: ChartConfig[];
  /** only these visual ids are exported */
  onlyVisuals?: string[] | null;
  /** false ships the model without the underlying table */
  includeData?: boolean;
  /** an ISO timestamp, passed in so the caller owns the clock */
  generatedAt?: string;
}

/** Derive the neutral dashboard description both exporters read. */
export function buildBiDashboard(
  dataset: Dataset,
  layout: DashboardLayout,
  options: BuildBiOptions = {}
): BiDashboard {
  const rows = options.rows ?? dataset.rows;
  const includeData = options.includeData !== false;
  const tableName = safeName(dataset.name) || "Data";

  const fields: BiField[] = dataset.profiles.map((profile) => ({
    name: profile.name,
    caption: titleize(profile.name),
    dataType: biDataType(profile.type),
    role: profile.type === "number" ? "measure" : "dimension",
  }));

  const panels = [
    ...layout.panels.map((panel) => ({
      id: panel.id,
      title: panel.title,
      subtitle: panel.subtitle,
      config: panel.config,
      wide: panel.wide,
    })),
    ...(options.pinned ?? []).map((config, i) => ({
      id: `pinned_${i}`,
      title: config.y ? `${titleize(config.y)} by ${titleize(config.x ?? "value")}` : "Record count",
      subtitle: "Pinned by the analyst.",
      config,
      wide: false,
    })),
  ];

  const selected = options.onlyVisuals
    ? panels.filter((panel) => options.onlyVisuals!.includes(panel.id))
    : panels;

  const selections = options.selections ?? {};
  const slicers: BiSlicer[] = layout.filters.slice(0, 4).map((filter, i) => ({
    column: filter.column,
    caption: filter.label,
    values: filter.values,
    selected: selections[filter.column] ?? [],
    layout: {
      x: GUTTER + i * (300 + GUTTER),
      y: GUTTER,
      width: 300,
      height: SLICER_BAND - GUTTER,
    },
  }));

  const visuals = layoutVisuals(selected, slicers.length > 0);

  // One measure per distinct column/aggregation pair the dashboard actually
  // uses, so the model carries no measure nothing references.
  const measureKeys = new Set<string>();
  const measures: BiMeasure[] = [];
  for (const visual of visuals) {
    const key = `${visual.y ?? "*"}|${visual.agg}`;
    if (measureKeys.has(key)) continue;
    measureKeys.add(key);
    measures.push(buildMeasure(tableName, visual.y, visual.agg));
  }
  if (measures.length === 0) measures.push(buildMeasure(tableName, null, "count"));

  return {
    name: safeName(dataset.name),
    datasetName: dataset.name,
    tableName,
    fields,
    measures,
    visuals,
    slicers,
    csv: includeData ? toCsv(dataset.columns, rows) : "",
    rowCount: includeData ? rows.length : 0,
    filtered: rows.length !== dataset.rows.length,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}
