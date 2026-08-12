"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Download,
  FilterX,
  LayoutDashboard,
  Lightbulb,
  Stethoscope,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { WorkspaceEmpty } from "@/components/layout/workspace-empty";
import { NextStep } from "@/components/layout/next-step";
import { TruncationBanner } from "@/components/truncation-banner";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { ChartPanel } from "@/components/dashboard/chart-panel";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ChartStudio } from "@/components/chart-studio";
import { PinnedCharts } from "@/components/pinned-charts";
import { NarrativePanel } from "@/components/dashboard/narrative-panel";
import { CategoryExplorer } from "@/components/category-explorer";
import { DashboardExportModal } from "@/components/export/dashboard-export-modal";
import { buildKpis } from "@/lib/kpi";
import { buildDashboardLayout, applyFilters, describeFilters } from "@/lib/dashboard";
import { buildDashboard } from "@/lib/auto-dashboard";
import { buildChartSeries, type ChartType } from "@/lib/chart-recommend";
import type { ChartCapture } from "@/lib/export-run";
import { PAGE_CENTERED, PAGE_WIDE } from "@/components/layout/page-shell";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface CrossFilter {
  column: string;
  value: string;
}

export default function DashboardPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [crossFilter, setCrossFilter] = useState<CrossFilter | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  /* An export has to ship what is on screen, and a reader can switch any panel
   * to another chart type. These two keep the page's own state in step with
   * what each panel is actually drawing. */
  const [panelTypes, setPanelTypes] = useState<Record<string, ChartType>>({});
  const panelElements = useRef(new Map<string, HTMLDivElement | null>());

  const registerPanel = useCallback((panelId: string, element: HTMLDivElement | null) => {
    panelElements.current.set(panelId, element);
  }, []);

  const handleTypeChange = useCallback((panelId: string, type: ChartType) => {
    setPanelTypes((current) => ({ ...current, [panelId]: type }));
  }, []);

  // The layout is chosen from the full dataset, so filtering changes what the
  // panels show but never which panels exist.
  const layout = useMemo(
    () => (activeDataset ? buildDashboardLayout(activeDataset) : null),
    [activeDataset]
  );

  const rows = useMemo(() => {
    if (!activeDataset) return [];
    const filtered = applyFilters(activeDataset.rows, selections);
    if (!crossFilter) return filtered;
    return filtered.filter(
      (r) => String(r[crossFilter.column] ?? "").trim() === crossFilter.value
    );
  }, [activeDataset, selections, crossFilter]);

  const kpiResult = useMemo(
    () => (activeDataset ? buildKpis(activeDataset, rows) : null),
    [activeDataset, rows]
  );

  const insights = useMemo(
    () => (activeDataset ? buildDashboard(activeDataset, rows).insights : []),
    [activeDataset, rows]
  );

  /* Read at export time rather than during render: the panel elements only
   * exist once the charts have mounted, and each panel may have been switched
   * to a different chart type since the layout was generated. */
  const collectCharts = useCallback((): ChartCapture[] => {
    if (!activeDataset || !layout) return [];
    return layout.panels.map((panel) => {
      const config = { ...panel.config, type: panelTypes[panel.id] ?? panel.config.type };
      return {
        id: panel.id,
        title: panel.title,
        subtitle: panel.subtitle,
        config,
        series: buildChartSeries(activeDataset, config, rows),
        element: panelElements.current.get(panel.id) ?? null,
      };
    });
  }, [activeDataset, layout, panelTypes, rows]);

  if (!mounted) {
    return (
      <div className={PAGE_CENTERED}>
        <p className="font-mono text-xs text-on-surface-variant">Building the dashboard…</p>
      </div>
    );
  }

  if (!activeDataset || !layout || !kpiResult) {
    return (
      <WorkspaceEmpty
        icon={LayoutDashboard}
        title="No dashboard yet"
        body="Nexora reads your columns, works out which KPIs the data can actually support, and lays out the charts that fit. Choose a dataset and it builds itself."
      />
    );
  }

  const openIssues = activeDataset.diagnostics.filter(
    (d) => d.severity === "warning" && !d.skipped
  ).length;
  const filtered = rows.length !== activeDataset.rows.length;

  const filterCaption = [
    describeFilters(selections),
    crossFilter ? `${crossFilter.column} = ${crossFilter.value}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const handleCrossFilter = (column: string, value: string) => {
    setCrossFilter((prev) =>
      prev && prev.column === column && prev.value === value ? null : { column, value }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className={`${PAGE_WIDE} space-y-6`}
    >
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-on-surface-variant">
            <LayoutDashboard className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Step 3 · Business intelligence
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-white md:text-[28px]">
            Dashboard
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            Built automatically from
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {activeDataset.name}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <button
            type="button"
            onClick={() => setIsExportOpen(true)}
            disabled={layout.panels.length === 0}
            className="pill h-10 cursor-pointer bg-primary px-5 text-[13px] text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
            title="Export this dashboard to Power BI, Tableau, Excel, PDF, PNG, or CSV"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export dashboard
          </button>
          <p className="max-w-sm text-[12px] leading-relaxed text-on-surface-variant/80 md:text-right">
            Every KPI and chart below was chosen from your column types and names. Change any chart
            type, filter the whole page, or export the lot to Power BI or Tableau and keep working
            there.
          </p>
        </div>
      </div>

      {/* Quality is upstream of every number on this page */}
      {openIssues > 0 && (
        <Link
          href="/dataset-doctor"
          className="press flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5 text-[12.5px] text-amber-200 transition-colors hover:bg-amber-400/[0.1]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {openIssues} unresolved data quality issue{openIssues === 1 ? "" : "s"} in this dataset.
            The numbers below inherit them.
          </span>
          <span className="flex shrink-0 items-center gap-1.5 font-medium">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
            Fix in Dataset Doctor
          </span>
        </Link>
      )}

      {activeDataset.truncated && <TruncationBanner rows={activeDataset.rows.length} />}

      <FilterBar
        filters={layout.filters}
        selections={selections}
        onChange={setSelections}
        visible={rows.length}
        total={activeDataset.rows.length}
      />

      {crossFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 font-mono text-[12px] text-primary">
            {crossFilter.column} = {crossFilter.value}
            <button
              type="button"
              onClick={() => setCrossFilter(null)}
              className="cursor-pointer transition-colors hover:text-white"
              aria-label="Clear the chart filter"
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
          <span className="text-[11px] text-on-surface-variant">
            Set by clicking a chart. Every panel and KPI on this page reflects it.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="nexora-card p-12 text-center">
          <p className="text-sm text-white">No rows match the current filters.</p>
          <button
            type="button"
            onClick={() => {
              setSelections({});
              setCrossFilter(null);
            }}
            className="press mt-3 cursor-pointer rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <KpiRow
            kpis={kpiResult.kpis}
            comparison={kpiResult.comparison}
            currency={kpiResult.currency}
          />

          {/* The story of the whole dataset, before any of the charts. The
              findings behind it were always being computed and only ever
              rendered on the Reports page, so the dashboard read as a grid of
              tiles with no argument in it. */}
          {!filtered && <NarrativePanel dataset={activeDataset} />}

          {/* The narrative above covers the unfiltered dataset. This shorter
              list stays for the filtered view, where it is saying something
              the narrative is not: what stands out within the current slice. */}
          {filtered && insights.length > 0 && (
            <section className="nexora-card p-5" aria-label="Automatic insights">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-400" aria-hidden="true" />
                <h2 className="text-[13px] font-semibold text-white">What stands out</h2>
                <span className="font-mono text-[10px] text-on-surface-variant">
                  (within the current filter)
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
                {insights.map((insight) => (
                  <li key={insight} className="flex gap-2 text-xs leading-relaxed text-on-surface-variant">
                    <span className="shrink-0 text-primary" aria-hidden="true">▸</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {layout.panels.length > 0 ? (
            <section aria-label="Charts" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {layout.panels.map((panel, i) => (
                <ChartPanel
                  key={panel.id}
                  dataset={activeDataset}
                  panel={panel}
                  rows={rows}
                  index={i}
                  onSelect={handleCrossFilter}
                  selected={crossFilter}
                  layout={layout}
                  selections={selections}
                  onTypeChange={handleTypeChange}
                  onRegister={registerPanel}
                />
              ))}
            </section>
          ) : (
            <div className="nexora-card p-10 text-center text-sm text-on-surface-variant">
              This dataset has no numeric, date, or category column to chart. Add one, or use SQL Lab
              to shape it first.
            </div>
          )}
        </>
      )}

      {/* Every categorical column, with the weight behind each value */}
      <CategoryExplorer dataset={activeDataset} />

      <PinnedCharts dataset={activeDataset} />

      {/* Anything the generated layout did not think of */}
      <section className="space-y-3 pt-2">
        <div className="px-1">
          <h2 className="text-lg font-semibold tracking-tight text-white">Build your own</h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Pick any two columns and any chart type. Nexora recommends the one that fits, and you can
            pin whatever you build to this dashboard.
          </p>
        </div>
        <ChartStudio dataset={activeDataset} />
      </section>

      <NextStep note="The picture is clear. Turn it into the written analysis you can send." />

      <DashboardExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        dataset={activeDataset}
        layout={layout}
        collectCharts={collectCharts}
        rows={rows}
        selections={selections}
        filterCaption={filterCaption}
      />
    </motion.div>
  );
}
