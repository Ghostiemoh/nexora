/* Dashboard composition. Decides which panels a dataset deserves and in what
 * order, the way an analyst would lay out a first draft: the trend on top, then
 * what drives it, then how it splits, then how it is distributed.
 *
 * Every panel is described as a ChartConfig, which is what the chart studio and
 * the renderer already speak. That is deliberate: it means each panel on the
 * dashboard can be switched to any other compatible chart type by the reader,
 * with no separate code path. Pure logic, no UI. */

import type { Dataset, Row } from "./types";
import type { ChartConfig } from "./chart-recommend";
import { compatibleTypes } from "./chart-recommend";
import { readSemantics, distinctCount } from "./semantics";
import { valueCounts, pearson } from "./auto-dashboard";
import { titleize } from "./kpi";

export interface DashboardPanel {
  id: string;
  title: string;
  /** one line on what the panel answers, shown under the title */
  subtitle: string;
  config: ChartConfig;
  /** trends read better across the full width */
  wide?: boolean;
}

export interface DashboardFilter {
  column: string;
  label: string;
  values: string[];
}

export interface DashboardLayout {
  panels: DashboardPanel[];
  filters: DashboardFilter[];
}

const MAX_PANELS = 8;
const MAX_FILTERS = 3;
const MAX_FILTER_VALUES = 40;

/** True when the config can actually be drawn as the type it asks for. */
function renderable(ds: Dataset, config: ChartConfig): boolean {
  return compatibleTypes(ds, config).find((t) => t.type === config.type)?.ok ?? false;
}

/** Build the default panel layout for a dataset. */
export function buildDashboardLayout(ds: Dataset): DashboardLayout {
  const sem = readSemantics(ds);
  const panels: DashboardPanel[] = [];
  const used = new Set<string>();

  const add = (panel: DashboardPanel) => {
    const key = `${panel.config.x}|${panel.config.y}|${panel.config.series ?? ""}|${panel.config.type}`;
    if (used.has(key) || panels.length >= MAX_PANELS) return;
    if (!renderable(ds, panel.config)) return;
    used.add(key);
    panels.push(panel);
  };

  // The measures that carry business meaning lead; anything else falls back to
  // the strongest numeric columns.
  const money =
    sem.measures.revenue?.[0]?.name ??
    sem.measures.profit?.[0]?.name ??
    sem.measures.quantity?.[0]?.name ??
    sem.allMeasures[0]?.name ??
    null;
  const secondMeasure = sem.allMeasures.find((m) => m.name !== money)?.name ?? null;
  const date = sem.primaryDate;

  // Dimensions ranked by how well they slice, with named business dimensions
  // pulled to the front.
  const namedDimensions = [
    ...(sem.dimensions.region ?? []),
    ...(sem.dimensions.product ?? []),
    ...(sem.dimensions.status ?? []),
  ]
    .map((d) => d.name)
    .filter((name) => sem.allDimensions.some((p) => p.name === name));
  const dimensions = [
    ...namedDimensions,
    ...sem.allDimensions.map((p) => p.name).filter((n) => !namedDimensions.includes(n)),
  ];

  const uniqueOf = (column: string) =>
    ds.profiles.find((p) => p.name === column)?.uniqueCount ?? 0;

  /* 1. The trend. Nothing on a dashboard matters more than direction. */
  if (date) {
    add({
      id: `trend_${money ?? "rows"}`,
      title: money ? `${titleize(money)} over time` : "Records over time",
      subtitle: money
        ? `How ${money} has moved across ${date}.`
        : `Record volume across ${date}.`,
      config: { type: "area", x: date, y: money, agg: money ? "sum" : "count", series: null },
      wide: true,
    });
  }

  /* 2. What drives the total: the lead measure broken down by the clearest
   *    dimension. This is the panel most decisions get made from. */
  const primaryDimension = dimensions[0] ?? null;
  if (primaryDimension && money) {
    add({
      id: `driver_${money}_${primaryDimension}`,
      title: `${titleize(money)} by ${titleize(primaryDimension)}`,
      subtitle: `Which ${primaryDimension} values contribute most.`,
      config: { type: "bar", x: primaryDimension, y: money, agg: "sum", series: null },
    });
  }

  /* 3. Composition: a small dimension reads as a share of the whole. */
  const shareDimension = dimensions.find((d) => uniqueOf(d) >= 2 && uniqueOf(d) <= 6) ?? null;
  if (shareDimension) {
    add({
      id: `share_${shareDimension}`,
      title: `${titleize(shareDimension)} share`,
      subtitle: money
        ? `Share of total ${money} per ${shareDimension}.`
        : `Share of records per ${shareDimension}.`,
      config: {
        type: "doughnut",
        x: shareDimension,
        y: money,
        agg: money ? "sum" : "count",
        series: null,
      },
    });
  }

  /* 4. A second dimension, ranked. */
  const secondDimension = dimensions.find((d) => d !== primaryDimension && d !== shareDimension) ?? null;
  if (secondDimension) {
    add({
      id: `rank_${secondDimension}`,
      title: `Top ${titleize(secondDimension)}`,
      subtitle: money
        ? `Ranked by total ${money}.`
        : `Ranked by number of records.`,
      config: {
        type: "bar",
        x: secondDimension,
        y: money,
        agg: money ? "sum" : "count",
        series: null,
      },
    });
  }

  /* 5. The second measure, so the dashboard is not a single-number story. */
  if (secondMeasure && primaryDimension) {
    add({
      id: `second_${secondMeasure}_${primaryDimension}`,
      title: `${titleize(secondMeasure)} by ${titleize(primaryDimension)}`,
      subtitle: `The same split, measured on ${secondMeasure}.`,
      config: { type: "bar", x: primaryDimension, y: secondMeasure, agg: "sum", series: null },
    });
  }

  /* 6. Distribution: averages hide their own shape. */
  if (money) {
    add({
      id: `dist_${money}`,
      title: `${titleize(money)} distribution`,
      subtitle: `Where individual ${money} values cluster.`,
      config: { type: "histogram", x: money, y: null, agg: "count", series: null },
    });
  }

  /* 7. Relationship, only when the two measures genuinely move together. */
  if (money && secondMeasure) {
    const r = pearson(ds.rows, money, secondMeasure);
    if (r !== null && Math.abs(r) >= 0.4) {
      add({
        id: `corr_${money}_${secondMeasure}`,
        title: `${titleize(money)} vs ${titleize(secondMeasure)}`,
        subtitle: `They move ${r > 0 ? "together" : "in opposite directions"} (r = ${r.toFixed(2)}).`,
        config: { type: "scatter", x: money, y: secondMeasure, agg: "sum", series: null },
      });
    }
  }

  /* 8. Cross-tab: two dimensions at once, where the pockets hide. */
  if (primaryDimension && secondDimension && uniqueOf(primaryDimension) <= 14 && uniqueOf(secondDimension) <= 14) {
    add({
      id: `cross_${primaryDimension}_${secondDimension}`,
      title: `${titleize(primaryDimension)} × ${titleize(secondDimension)}`,
      subtitle: money
        ? `Total ${money} at every intersection.`
        : `Record count at every intersection.`,
      config: {
        type: "heatmap",
        x: primaryDimension,
        y: money,
        agg: money ? "sum" : "count",
        series: secondDimension,
      },
      wide: true,
    });
  }

  /* 9. A second trend line, when there is a second measure to track. */
  if (date && secondMeasure) {
    add({
      id: `trend2_${secondMeasure}`,
      title: `${titleize(secondMeasure)} over time`,
      subtitle: `The trend on ${secondMeasure}, for comparison.`,
      config: { type: "line", x: date, y: secondMeasure, agg: "sum", series: null },
      wide: true,
    });
  }

  return { panels, filters: buildFilters(ds) };
}

/** The dimensions worth putting in a filter bar: enough values to be a choice,
 *  few enough to be a menu. */
export function buildFilters(ds: Dataset): DashboardFilter[] {
  const sem = readSemantics(ds);
  const filters: DashboardFilter[] = [];

  for (const profile of sem.allDimensions) {
    if (filters.length >= MAX_FILTERS) break;
    if (profile.uniqueCount < 2 || profile.uniqueCount > MAX_FILTER_VALUES) continue;
    const values = valueCounts(ds.rows, profile.name)
      .slice(0, MAX_FILTER_VALUES)
      .map((v) => v.name);
    if (values.length < 2) continue;
    filters.push({ column: profile.name, label: titleize(profile.name), values });
  }

  return filters;
}

/** Apply the filter bar's selections. An empty selection means "all", so the
 *  dashboard never renders an empty state just because nothing is ticked. */
export function applyFilters(rows: Row[], selections: Record<string, string[]>): Row[] {
  const active = Object.entries(selections).filter(([, values]) => values.length > 0);
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every(([column, values]) => values.includes(String(row[column] ?? "").trim()))
  );
}

/** A short caption for the current filter state, e.g. "Region: West, East". */
export function describeFilters(selections: Record<string, string[]>): string {
  const parts = Object.entries(selections)
    .filter(([, values]) => values.length > 0)
    .map(([column, values]) => `${titleize(column)}: ${values.join(", ")}`);
  return parts.join(" · ");
}

/** Distinct value count for a column, re-exported so the dashboard header can
 *  describe the grain of what is on screen without importing the semantics
 *  module directly. */
export { distinctCount };
