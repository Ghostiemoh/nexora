"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Lightbulb, FilterX } from "lucide-react";
import { motion } from "framer-motion";
import type { Dataset } from "@/lib/types";
import { buildDashboard, type ChartSpec, type KpiSpec } from "@/lib/auto-dashboard";

export interface CrossFilter {
  column: string;
  value: string;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const PALETTE = [
  "#c0c1ff", // primary
  "#34d399", // emerald
  "#fbbf24", // amber
  "#38bdf8", // sky
  "#f472b6", // pink
  "#a78bfa", // violet
  "#fb923c", // orange
  "#4ade80", // green
];

const AXIS_TICK = { fill: "#8a91a8", fontSize: 11 } as const;
const GRID_STROKE = "rgba(255,255,255,0.06)";

const TOOLTIP_STYLE = {
  backgroundColor: "#11182b",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#dae2fd",
} as const;

function formatKpi(kpi: KpiSpec): string {
  if (kpi.format === "percent") return `${kpi.value}%`;
  const abs = Math.abs(kpi.value);
  if (abs >= 1_000_000) return `${(kpi.value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(kpi.value / 1_000).toFixed(1)}K`;
  if (kpi.format === "integer" || Number.isInteger(kpi.value)) {
    return kpi.value.toLocaleString("en-US");
  }
  return kpi.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const fmtAxis = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

interface ChartCardProps {
  spec: ChartSpec;
  index: number;
  activeFilter: CrossFilter | null;
  onFilter?: (f: CrossFilter) => void;
  /** false renders the final state immediately (reports, print) */
  animated?: boolean;
}

function ChartCard({ spec, index, activeFilter, onFilter, animated = true }: ChartCardProps) {
  const wide = spec.kind === "line";
  const filterCol = spec.kind === "pie" || spec.kind === "bar" ? spec.filterColumn : undefined;
  const clickable = !!filterCol && !!onFilter;

  const handleSelect = (name: string) => {
    if (!clickable || name === "Other") return;
    onFilter!({ column: filterCol!, value: name });
  };

  const dimmed = (name: string) =>
    activeFilter && activeFilter.column === filterCol && activeFilter.value !== name;
  return (
    <motion.div
      initial={animated ? { opacity: 0, y: 14 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.3), ease: EASE_OUT }}
      className={`nexora-card p-5 ${wide ? "lg:col-span-2" : ""}`}
    >
      <h4 className="text-[13px] font-semibold text-white mb-1">{spec.title}</h4>
      <p className="text-[11px] text-on-surface-variant mb-4 font-mono">
        {spec.kind === "pie" && "composition · row share"}
        {spec.kind === "bar" && `ranked · ${spec.valueLabel}`}
        {spec.kind === "histogram" && "distribution · 10 equal-width bins"}
        {spec.kind === "line" && `trend · ${spec.valueLabel}`}
        {clickable && <span className="text-primary/70"> · click to filter</span>}
      </p>
      <div className={wide ? "h-72" : "h-64"}>
        {spec.kind === "pie" && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={spec.data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="52%"
                outerRadius="78%"
                paddingAngle={2}
                stroke="#0b1326"
                strokeWidth={2}
                onClick={(entry) => {
                  const name = (entry as { name?: string }).name;
                  if (name) handleSelect(name);
                }}
              >
                {spec.data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={PALETTE[i % PALETTE.length]}
                    fillOpacity={dimmed(d.name) ? 0.25 : 1}
                    cursor={clickable ? "pointer" : undefined}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: "#8a91a8" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {(spec.kind === "bar" || spec.kind === "histogram") && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={spec.kind === "bar" ? spec.data : spec.data.map((d) => ({ name: d.bin, value: d.count }))}
              margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="name"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
                interval="preserveStartEnd"
                angle={spec.kind === "histogram" ? -32 : 0}
                textAnchor={spec.kind === "histogram" ? "end" : "middle"}
                height={spec.kind === "histogram" ? 52 : 28}
              />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={fmtAxis} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar
                dataKey="value"
                radius={[5, 5, 0, 0]}
                maxBarSize={44}
                onClick={(entry) => {
                  const name = (entry as { name?: string }).name;
                  if (name) handleSelect(name);
                }}
              >
                {(spec.kind === "bar"
                  ? spec.data.map((d) => d.name)
                  : spec.data.map((d) => d.bin)
                ).map((name, i) => (
                  <Cell
                    key={i}
                    fill={spec.kind === "histogram" ? "#c0c1ff" : PALETTE[i % PALETTE.length]}
                    fillOpacity={
                      spec.kind === "histogram" ? 0.85 : dimmed(name) ? 0.25 : 1
                    }
                    cursor={clickable ? "pointer" : undefined}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {spec.kind === "line" && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spec.data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad_${spec.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c0c1ff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#c0c1ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="date"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={fmtAxis} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#c0c1ff"
                strokeWidth={2}
                fill={`url(#grad_${spec.id})`}
                dot={spec.data.length <= 31}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

export function AutoDashboard({
  dataset,
  interactive = true,
}: {
  dataset: Dataset;
  /** false renders a static version (reports, print) */
  interactive?: boolean;
}) {
  const [filter, setFilter] = useState<CrossFilter | null>(null);

  const filteredRows = useMemo(() => {
    if (!filter) return undefined;
    return dataset.rows.filter(
      (r) => String(r[filter.column] ?? "").trim() === filter.value
    );
  }, [dataset, filter]);

  const spec = useMemo(
    () => buildDashboard(dataset, filteredRows),
    [dataset, filteredRows]
  );

  const handleFilter = (f: CrossFilter) => {
    // Clicking the active slice again clears the filter.
    setFilter((prev) =>
      prev && prev.column === f.column && prev.value === f.value ? null : f
    );
  };

  if (spec.charts.length === 0 && spec.insights.length === 0) {
    return (
      <div className="nexora-card p-10 text-center text-sm text-on-surface-variant">
        Not enough structure to chart yet — add a numeric, date, or category column.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Active cross-filter chip */}
      {filter && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 text-[12px] bg-primary/10 border border-primary/25 text-primary px-3 py-1.5 rounded-full font-mono">
            {filter.column} = {filter.value}
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Clear filter"
            >
              <FilterX className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className="text-[11px] text-on-surface-variant">
            {filteredRows?.length ?? 0} of {dataset.rows.length} rows — every card below reflects this filter
          </span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {spec.kpis.map((kpi, i) => (
          <motion.div
            key={kpi.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05, ease: EASE_OUT }}
            className="nexora-card p-4"
          >
            <p className="text-[11px] text-on-surface-variant truncate" title={kpi.label}>
              {kpi.label}
            </p>
            <p className="text-xl font-semibold text-white tabular-nums mt-1">{formatKpi(kpi)}</p>
            {kpi.sub && (
              <p className="text-[10px] font-mono text-on-surface-variant/80 mt-1 truncate" title={kpi.sub}>
                {kpi.sub}
              </p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Auto insights */}
      {spec.insights.length > 0 && (
        <div className="nexora-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h4 className="text-[13px] font-semibold text-white">Auto insights</h4>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {spec.insights.map((insight) => (
              <li
                key={insight}
                className="text-xs text-on-surface-variant leading-relaxed flex gap-2"
              >
                <span className="text-primary shrink-0">▸</span>
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Chart grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {spec.charts.map((chart, i) => (
          <ChartCard
            key={chart.id}
            spec={chart}
            index={i}
            activeFilter={filter}
            onFilter={interactive ? handleFilter : undefined}
            animated={interactive}
          />
        ))}
      </div>
    </div>
  );
}
