"use client";

import { Pin, X } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { useNexora } from "@/lib/store";
import { buildChartSeries, CHART_LABELS } from "@/lib/chart-recommend";
import { describeChart } from "@/lib/workflow";
import { ChartRenderer } from "./chart-renderer";

/** Charts the user pinned in Chart Studio, or that a workflow template pinned
 *  when it was applied. This is what makes a saved workflow visible. */
export function PinnedCharts({ dataset }: { dataset: Dataset }) {
  const pinned = useNexora((s) => s.pinnedCharts[dataset.id]) ?? [];
  const unpinChart = useNexora((s) => s.unpinChart);

  if (pinned.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
          <Pin className="h-4 w-4 text-primary" aria-hidden="true" />
          Pinned charts
        </h2>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {pinned.length} chart{pinned.length === 1 ? "" : "s"} kept on this dashboard. Save them as
          a workflow to rebuild this view on your next file.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {pinned.map((config, i) => {
          const series = buildChartSeries(dataset, config);
          return (
            <div key={`${config.type}-${config.x}-${config.y}-${i}`} className="nexora-card p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-[13px] font-semibold text-white">
                    {CHART_LABELS[config.type]}: {config.y ? `${config.agg} of ${config.y}` : "row count"}
                    {config.x ? ` by ${config.x}` : ""}
                  </h4>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-on-surface-variant">
                    {describeChart(config)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unpinChart(dataset.id, i)}
                  aria-label="Unpin this chart"
                  className="press flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {series ? (
                <ChartRenderer config={config} series={series} height={260} />
              ) : (
                <p className="py-12 text-center text-xs text-on-surface-variant">
                  This chart needs columns that are not in {dataset.name}.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
