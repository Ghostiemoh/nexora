"use client";

import { useId } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ChartConfig, ChartSeries } from "@/lib/chart-recommend";
import { CHART_PALETTE } from "@/lib/chart-palette";

/* Re-exported so the many components already importing the palette from the
 * renderer keep working; the values themselves live in lib/chart-palette so an
 * export can use them without pulling in a client component. */
export { CHART_PALETTE };

const AXIS_TICK = { fill: "#b7bfba", fontSize: 11 } as const;
const GRID_STROKE = "rgba(255,255,255,0.06)";

const TOOLTIP_STYLE = {
  backgroundColor: "#1b2020",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#f1f2ed",
} as const;

export const fmtAxis = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Number(v.toFixed(2)));
};

export interface ChartRendererProps {
  config: ChartConfig;
  series: ChartSeries;
  /** clicking a bar or slice filters the dashboard on that value */
  onSelect?: (value: string) => void;
  /** the currently filtered value, so everything else can dim */
  selected?: string | null;
  height?: number;
}

/** One renderer for all eight chart types, so switching type never changes
 *  anything except the marks on screen. */
export function ChartRenderer({
  config,
  series,
  onSelect,
  selected,
  height = 280,
}: ChartRendererProps) {
  const gradientId = useId().replace(/:/g, "");
  const valueLabel = config.y ? `${config.agg} of ${config.y}` : "rows";

  const dimmed = (name: string) => selected != null && selected !== name;
  const clickable = !!onSelect && series.shape === "category";

  const handleClick = (name?: string) => {
    if (!clickable || !name || name === "Other") return;
    onSelect!(name);
  };

  if (series.shape === "matrix") {
    return <Heatmap series={series} valueLabel={valueLabel} height={height} />;
  }

  if (series.shape === "scatter") {
    return (
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis
              type="number"
              dataKey="x"
              name={config.x ?? "x"}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              tickFormatter={fmtAxis}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={config.y ?? "y"}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtAxis}
            />
            <ZAxis range={[26, 26]} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={series.data} fill={CHART_PALETTE[0]} fillOpacity={0.55} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const data = series.data;
  const isBins = series.shape === "bins";
  const isTime = series.shape === "time";

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {config.type === "pie" || config.type === "doughnut" ? (
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={config.type === "doughnut" ? "52%" : 0}
              outerRadius="78%"
              paddingAngle={config.type === "doughnut" ? 2 : 1}
              stroke="#101315"
              strokeWidth={2}
              onClick={(entry) => handleClick((entry as { name?: string }).name)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.name}
                  fill={CHART_PALETTE[i % CHART_PALETTE.length]}
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
              wrapperStyle={{ fontSize: 11, color: "#b7bfba" }}
            />
          </PieChart>
        ) : config.type === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="name"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={fmtAxis} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line
              type="monotone"
              dataKey="value"
              name={valueLabel}
              stroke={CHART_PALETTE[0]}
              strokeWidth={2}
              dot={data.length <= 31 ? { r: 2.5, fill: CHART_PALETTE[0] } : false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        ) : config.type === "area" ? (
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
            <defs>
              <linearGradient id={`area_${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_PALETTE[0]} stopOpacity={0.38} />
                <stop offset="100%" stopColor={CHART_PALETTE[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="name"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={fmtAxis} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="value"
              name={valueLabel}
              stroke={CHART_PALETTE[0]}
              strokeWidth={2}
              fill={`url(#area_${gradientId})`}
              dot={false}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="name"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              interval="preserveStartEnd"
              angle={isBins || data.length > 8 ? -32 : 0}
              textAnchor={isBins || data.length > 8 ? "end" : "middle"}
              height={isBins || data.length > 8 ? 56 : 28}
            />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={fmtAxis} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar
              dataKey="value"
              name={isBins ? "rows" : valueLabel}
              radius={[5, 5, 0, 0]}
              maxBarSize={46}
              onClick={(entry) => handleClick((entry as { name?: string }).name)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.name}
                  // Histograms are one distribution, not eight categories, so a
                  // single colour keeps the shape readable.
                  fill={isBins || isTime ? CHART_PALETTE[0] : CHART_PALETTE[i % CHART_PALETTE.length]}
                  fillOpacity={isBins ? 0.85 : dimmed(d.name) ? 0.25 : 1}
                  cursor={clickable ? "pointer" : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Recharts has no heatmap, so this is a plain grid: honest colour ramp,
 *  readable labels, and the value in the cell when there is room. */
function Heatmap({
  series,
  valueLabel,
  height,
}: {
  series: Extract<ChartSeries, { shape: "matrix" }>;
  valueLabel: string;
  height: number;
}) {
  const span = series.max - series.min;
  const intensity = (v: number) => (span === 0 ? (v > 0 ? 1 : 0) : (v - series.min) / span);

  return (
    <div className="overflow-auto" style={{ maxHeight: height }}>
      <table className="w-full border-separate border-spacing-1 text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface-container-low p-1 text-left font-medium text-on-surface-variant">
              <span className="sr-only">Row category</span>
            </th>
            {series.cols.map((c) => (
              <th
                key={c}
                className="max-w-[90px] truncate p-1 text-left font-medium text-on-surface-variant"
                title={c}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.rows.map((r) => (
            <tr key={r}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[140px] truncate bg-surface-container-low p-1 text-left font-medium text-on-surface"
                title={r}
              >
                {r}
              </th>
              {series.cols.map((c) => {
                const cell = series.cells.find((x) => x.row === r && x.col === c);
                const value = cell?.value ?? 0;
                const t = intensity(value);
                return (
                  <td
                    key={c}
                    title={`${r} · ${c}: ${value} ${valueLabel}`}
                    className="rounded-md px-2 py-2 text-center tabular-nums"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${CHART_PALETTE[0]} ${Math.round(t * 82 + 4)}%, transparent)`,
                      color: t > 0.55 ? "#171208" : "#b7bfba",
                    }}
                  >
                    {fmtAxis(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
