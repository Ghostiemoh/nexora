"use client";

import { useMemo, useState } from "react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldAlert,
  Target,
  Sparkle,
  Link2,
  Trophy,
  Gauge,
  ChevronDown,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Dataset } from "@/lib/types";
import { analyze, type Finding, type FindingKind, type Severity } from "@/lib/insights";

const KIND_ICON: Record<FindingKind, LucideIcon> = {
  trend: TrendingUp,
  change: TrendingDown,
  outlier: AlertTriangle,
  quality: Gauge,
  correlation: Link2,
  target: Target,
  performance: Trophy,
  risk: ShieldAlert,
  opportunity: Sparkle,
};

const SEVERITY_STYLE: Record<Severity, { chip: string; icon: string; label: string }> = {
  critical: {
    chip: "border-red-400/30 bg-red-400/10 text-red-300",
    icon: "text-red-300",
    label: "Critical",
  },
  warning: {
    chip: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    icon: "text-amber-300",
    label: "Needs attention",
  },
  info: {
    chip: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    icon: "text-sky-300",
    label: "For information",
  },
  positive: {
    chip: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    icon: "text-emerald-300",
    label: "Positive",
  },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Attention" },
  { id: "opportunity", label: "Opportunities" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function matchesFilter(finding: Finding, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "opportunity") return finding.kind === "opportunity" || finding.severity === "positive";
  return finding.severity === filter;
}

/** The dashboard's analyst: what happened, why, what it costs, what to do. */
export function IntelligencePanel({ dataset }: { dataset: Dataset }) {
  const intel = useMemo(() => analyze(dataset), [dataset]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [expanded, setExpanded] = useState<string | null>(intel.findings[0]?.id ?? null);

  const visible = intel.findings.filter((f) => matchesFilter(f, filter));
  const counts = {
    critical: intel.findings.filter((f) => f.severity === "critical").length,
    warning: intel.findings.filter((f) => f.severity === "warning").length,
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
            <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
            What the data is telling you
          </h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {intel.findings.length} finding{intel.findings.length === 1 ? "" : "s"}, ranked by how
            much each should change your next decision
            {counts.critical > 0 && ` · ${counts.critical} critical`}
            {counts.warning > 0 && ` · ${counts.warning} need attention`}.
          </p>
        </div>

        <div role="group" aria-label="Filter findings" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`press h-8 cursor-pointer rounded-lg border px-2.5 text-[12px] font-medium transition-colors ${
                filter === f.id
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-white/10 bg-white/[0.03] text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Executive summary */}
      <div className="nexora-ai-card p-5">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          Executive summary
        </h3>
        <p className="text-[13px] leading-relaxed text-on-surface">{intel.summary}</p>
      </div>

      {/* Findings */}
      {visible.length === 0 ? (
        <div className="nexora-card p-8 text-center text-sm text-on-surface-variant">
          No findings in this category.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((finding, i) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              index={i}
              open={expanded === finding.id}
              onToggle={() =>
                setExpanded((current) => (current === finding.id ? null : finding.id))
              }
            />
          ))}
        </div>
      )}

      {/* Recommendations */}
      {intel.recommendations.length > 0 && (
        <div className="nexora-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-white">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
            Recommended actions
          </h3>
          <ol className="space-y-2">
            {intel.recommendations.map((rec, i) => (
              <li key={rec} className="flex gap-3 text-[12.5px] leading-relaxed text-on-surface-variant">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-[10px] font-semibold tabular-nums text-primary">
                  {i + 1}
                </span>
                {rec}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function FindingCard({
  finding,
  index,
  open,
  onToggle,
}: {
  finding: Finding;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = KIND_ICON[finding.kind];
  const style = SEVERITY_STYLE[finding.severity];
  const panelId = `finding-${finding.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.24), ease: [0.23, 1, 0.32, 1] }}
      className="nexora-card overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="press flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${style.icon}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug text-white">
            {finding.title}
          </span>
          <span className="mt-1 block line-clamp-2 text-[12px] leading-relaxed text-on-surface-variant">
            {finding.what}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`hidden rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline ${style.chip}`}>
            {style.label}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-on-surface-variant transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div id={panelId} className="space-y-3 border-t border-white/[0.06] px-4 py-4">
          <Detail label="What happened" body={finding.what} />
          {finding.why && <Detail label="Why it may have happened" body={finding.why} />}
          {finding.impact && <Detail label="Likely impact" body={finding.impact} />}
          {finding.recommendation && (
            <Detail label="What to do next" body={finding.recommendation} accent />
          )}
          {finding.columns.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                Columns
              </span>
              {finding.columns.map((c) => (
                <span
                  key={c}
                  className="rounded-md border border-white/10 bg-black/25 px-2 py-0.5 font-mono text-[11px] text-on-surface-variant"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function Detail({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <p className={`text-[12.5px] leading-relaxed ${accent ? "text-primary" : "text-on-surface"}`}>
        {body}
      </p>
    </div>
  );
}
