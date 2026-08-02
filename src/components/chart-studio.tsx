"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  AreaChart as AreaIcon,
  ScatterChart as ScatterIcon,
  BarChartHorizontal,
  Donut,
  Grid3x3,
  Sparkles,
  Pin,
  type LucideIcon,
} from "lucide-react";
import type { Dataset } from "@/lib/types";
import { useNexora } from "@/lib/store";
import {
  recommendChart,
  recommendTypeFor,
  compatibleTypes,
  buildChartSeries,
  columnRoles,
  CHART_LABELS,
  AGGREGATIONS,
  type ChartConfig,
  type ChartType,
  type Aggregation,
} from "@/lib/chart-recommend";
import { ChartRenderer } from "./chart-renderer";

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

const NONE = "__none__";

export function ChartStudio({ dataset }: { dataset: Dataset }) {
  const recommendation = useMemo(() => recommendChart(dataset), [dataset]);
  const roles = useMemo(() => columnRoles(dataset), [dataset]);

  const [config, setConfig] = useState<ChartConfig>(recommendation.config);
  const [pinnedNotice, setPinnedNotice] = useState(false);
  const [prevDatasetId, setPrevDatasetId] = useState(dataset.id);

  const pinChart = useNexora((s) => s.pinChart);

  // A new dataset gets its own recommendation rather than inheriting a config
  // whose columns may not exist here.
  if (dataset.id !== prevDatasetId) {
    setPrevDatasetId(dataset.id);
    setConfig(recommendation.config);
    setPinnedNotice(false);
  }

  const availability = useMemo(() => compatibleTypes(dataset, config), [dataset, config]);
  const series = useMemo(() => buildChartSeries(dataset, config), [dataset, config]);

  // The recommendation follows the columns the user picks, not just the dataset.
  const bestForSelection = useMemo(
    () => recommendTypeFor(dataset, config.x, config.y, config.series),
    [dataset, config.x, config.y, config.series]
  );

  const dimensionOptions = [...roles.dates, ...roles.dimensions, ...roles.measures];
  const seriesOptions = roles.dimensions.filter((d) => d !== config.x);

  const update = (patch: Partial<ChartConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      // Changing the axes can invalidate the current type: fall back to the
      // type that fits rather than rendering an empty frame.
      const stillFits = compatibleTypes(dataset, next).find((t) => t.type === next.type)?.ok;
      if (!stillFits) next.type = recommendTypeFor(dataset, next.x, next.y, next.series).type;
      return next;
    });
    setPinnedNotice(false);
  };

  const handlePin = () => {
    pinChart(dataset.id, config);
    setPinnedNotice(true);
  };

  return (
    <div className="nexora-card p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-white">Chart studio</h3>
          <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-on-surface-variant">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-medium text-on-surface">
                Recommended: {CHART_LABELS[bestForSelection.type]}.
              </span>{" "}
              {bestForSelection.reason}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handlePin}
          className="press flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-[12.5px] text-on-surface transition-colors hover:bg-white/[0.08]"
        >
          <Pin className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden="true" />
          {pinnedNotice ? "Pinned" : "Pin to dashboard"}
        </button>
      </div>

      {/* Type switcher */}
      <div role="group" aria-label="Chart type" className="flex flex-wrap gap-1.5">
        {availability.map(({ type, ok, reason }) => {
          const Icon = TYPE_ICONS[type];
          const active = config.type === type;
          const recommended = bestForSelection.type === type;
          return (
            <button
              key={type}
              type="button"
              disabled={!ok}
              onClick={() => update({ type })}
              title={ok ? `Show as ${CHART_LABELS[type]}` : reason}
              aria-pressed={active}
              className={`press relative flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors ${
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : ok
                    ? "cursor-pointer border-white/10 bg-white/[0.03] text-on-surface-variant hover:bg-white/[0.07] hover:text-on-surface"
                    : "cursor-not-allowed border-white/[0.06] bg-transparent text-on-surface-variant/35"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {CHART_LABELS[type]}
              {recommended && ok && !active && (
                <span
                  className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                  aria-label="recommended"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Field pickers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={config.type === "scatter" ? "X axis" : "Group by"}>
          <select
            value={config.x ?? NONE}
            onChange={(e) => update({ x: e.target.value === NONE ? null : e.target.value })}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary/50"
          >
            {dimensionOptions.map((c) => (
              <option key={c} value={c} className="bg-surface-container">
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label={config.type === "scatter" ? "Y axis" : "Measure"}>
          <select
            value={config.y ?? NONE}
            onChange={(e) =>
              update({
                y: e.target.value === NONE ? null : e.target.value,
                agg: e.target.value === NONE ? "count" : config.agg === "count" ? "sum" : config.agg,
              })
            }
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

        <Field label="Aggregation">
          <select
            value={config.agg}
            disabled={config.y === null}
            onChange={(e) => update({ agg: e.target.value as Aggregation })}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {AGGREGATIONS.map((a) => (
              <option key={a} value={a} className="bg-surface-container">
                {a}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Split by (heatmap)">
          <select
            value={config.series ?? NONE}
            onChange={(e) => update({ series: e.target.value === NONE ? null : e.target.value })}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-primary/50"
          >
            <option value={NONE} className="bg-surface-container">
              None
            </option>
            {seriesOptions.map((c) => (
              <option key={c} value={c} className="bg-surface-container">
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {series ? (
        <ChartRenderer config={config} series={series} height={320} />
      ) : (
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-white/10 text-center text-xs text-on-surface-variant">
          No values to plot for this combination. Choose a different column.
        </div>
      )}
    </div>
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
