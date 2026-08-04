"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart as AreaIcon,
  BarChart3,
  BarChartHorizontal,
  Donut,
  Grid3x3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Pin,
  ScatterChart as ScatterIcon,
  type LucideIcon,
} from "lucide-react";
import type { Dataset, Row } from "@/lib/types";
import { useNexora } from "@/lib/store";
import {
  buildChartSeries,
  compatibleTypes,
  recommendTypeFor,
  CHART_LABELS,
  type ChartConfig,
  type ChartType,
} from "@/lib/chart-recommend";
import { ChartRenderer } from "@/components/chart-renderer";
import type { DashboardPanel } from "@/lib/dashboard";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const TYPE_ICONS: Record<ChartType, LucideIcon> = {
  bar: BarChart3,
  line: LineIcon,
  pie: PieIcon,
  area: AreaIcon,
  scatter: ScatterIcon,
  histogram: BarChartHorizontal,
  doughnut: Donut,
  heatmap: Grid3x3,
};

export interface ChartPanelProps {
  dataset: Dataset;
  panel: DashboardPanel;
  /** the rows the dashboard filters are currently showing */
  rows: Row[];
  index: number;
  /** clicking a bar or slice cross-filters the whole dashboard */
  onSelect?: (column: string, value: string) => void;
  /** the value the dashboard is cross-filtered on, so this panel can dim */
  selected?: { column: string; value: string } | null;
}

/** One dashboard panel. Every panel owns a full chart-type switcher, not just
 *  the first one: the generated type is a starting point, never a verdict. */
export function ChartPanel({
  dataset,
  panel,
  rows,
  index,
  onSelect,
  selected,
}: ChartPanelProps) {
  const [type, setType] = useState<ChartType>(panel.config.type);
  const pinChart = useNexora((s) => s.pinChart);
  const [pinned, setPinned] = useState(false);

  const config: ChartConfig = useMemo(() => ({ ...panel.config, type }), [panel.config, type]);

  const availability = useMemo(() => compatibleTypes(dataset, config), [dataset, config]);
  const series = useMemo(() => buildChartSeries(dataset, config, rows), [dataset, config, rows]);
  const recommended = useMemo(
    () => recommendTypeFor(dataset, config.x, config.y, config.series).type,
    [dataset, config.x, config.y, config.series]
  );

  const filterColumn = series?.shape === "category" ? series.filterColumn : undefined;
  const selectedValue =
    selected && filterColumn && selected.column === filterColumn ? selected.value : null;

  const handlePin = () => {
    pinChart(dataset.id, config);
    setPinned(true);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.3), ease: EASE_OUT }}
      className={`nexora-card flex flex-col p-5 ${panel.wide ? "lg:col-span-2" : ""}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-white">{panel.title}</h3>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-on-surface-variant">
            {panel.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={handlePin}
          title="Keep this chart with the dataset"
          aria-label={`Pin ${panel.title}`}
          className={`press flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors ${
            pinned
              ? "border-primary/30 bg-primary/12 text-primary"
              : "border-white/10 text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
          }`}
        >
          <Pin className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Type switcher, on every panel */}
      <div role="group" aria-label={`Chart type for ${panel.title}`} className="mb-3 flex flex-wrap gap-1">
        {availability.map(({ type: option, ok, reason }) => {
          const Icon = TYPE_ICONS[option];
          const active = type === option;
          return (
            <button
              key={option}
              type="button"
              disabled={!ok}
              onClick={() => setType(option)}
              title={ok ? `Show as ${CHART_LABELS[option]}` : reason}
              aria-pressed={active}
              aria-label={CHART_LABELS[option]}
              className={`press flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors ${
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : ok
                    ? "cursor-pointer border-white/10 bg-white/[0.03] text-on-surface-variant hover:bg-white/[0.07] hover:text-on-surface"
                    : "cursor-not-allowed border-white/[0.06] bg-transparent text-on-surface-variant/30"
              }`}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">{CHART_LABELS[option]}</span>
              {recommended === option && ok && !active && (
                <span className="h-1 w-1 rounded-full bg-primary" aria-label="recommended" />
              )}
            </button>
          );
        })}
      </div>

      {series ? (
        <ChartRenderer
          config={config}
          series={series}
          height={panel.wide ? 300 : 260}
          selected={selectedValue}
          onSelect={
            onSelect && filterColumn ? (value) => onSelect(filterColumn, value) : undefined
          }
        />
      ) : (
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-white/10 text-center text-xs text-on-surface-variant">
          No values to plot in the current filter.
        </div>
      )}

      {filterColumn && onSelect && (
        <p className="mt-2 font-mono text-[10px] text-on-surface-variant/60">
          click a {type === "pie" || type === "doughnut" ? "slice" : "bar"} to filter the dashboard
        </p>
      )}
    </motion.article>
  );
}
