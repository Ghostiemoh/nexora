"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileJson,
  FileUp,
  GitBranch,
  Info,
  Layers,
  Microscope,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { JoinCreatorModal } from "@/components/layout/join-creator-modal";
import { TruncationBanner } from "@/components/truncation-banner";
import { ValueReview } from "@/components/value-review";
import { TransformTools } from "@/components/transform-tools";
import { GettingStarted } from "@/components/getting-started";
import { WorkspaceEmpty } from "@/components/layout/workspace-empty";
import { NextStep } from "@/components/layout/next-step";
import { SectionNav, type SectionLink } from "@/components/section-nav";
import { LiveWorkbench } from "@/components/doctor/live-workbench";
import {
  InvestigationPanel,
  type InvestigationKind,
} from "@/components/doctor/investigation-panel";
import { buildRecipe, serializeRecipe, parseRecipe, previewCleanOp, type OpPreview } from "@/lib/recipe";
import type { CleanOp, Dataset } from "@/lib/types";
import { PAGE_CENTERED, PAGE_WIDE } from "@/components/layout/page-shell";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const SECTIONS: SectionLink[] = [
  { id: "overview", label: "Overview" },
  { id: "dimensions", label: "Quality dimensions" },
  { id: "findings", label: "Findings & fixes" },
  { id: "cells", label: "Cells & live preview" },
  { id: "schema", label: "Columns & types" },
  { id: "tools", label: "Cleaning tools" },
];

/** The counts a data-quality review opens with, all read from the profile so
 *  they always agree with the fixes offered below. */
function qualityCounts(ds: Dataset) {
  const cells = ds.rows.length * ds.columns.length;
  let missing = 0;
  let outliers = 0;
  let invalid = 0;
  let formatIssues = 0;

  for (const column of ds.profiles) {
    missing += column.missingCount;
    outliers += column.outlierCount ?? 0;
    const present = ds.rows.length - column.missingCount;
    invalid += Math.round(((100 - column.validity) / 100) * present);
    if (column.hasWhitespace || column.hasMojibake) formatIssues++;
  }

  return {
    cells,
    missing,
    missingPct: cells === 0 ? 0 : (missing / cells) * 100,
    duplicates: ds.duplicateRows,
    outliers,
    invalid,
    formatIssues,
    columnsWithGaps: ds.profiles.filter((p) => p.missingCount > 0).length,
  };
}

export default function DatasetDoctorPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const applyFix = useNexora((s) => s.applyFix);
  const undoFix = useNexora((s) => s.undoFix);
  const undoDepth = useNexora((s) => s.undoDepth);
  const skipDiagnostic = useNexora((s) => s.skipDiagnostic);
  const unskipDiagnostic = useNexora((s) => s.unskipDiagnostic);
  const applyRecipe = useNexora((s) => s.applyRecipe);
  const recordExport = useNexora((s) => s.recordExport);
  const notify = useNexora((s) => s.notify);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  const [fixingId, setFixingId] = useState<string | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  /* Which finding is open for investigation. Missing values and outliers are
     the two that reward one: both are questions about the data rather than
     defects in it, so both get a door out of the fix/ignore pair. */
  const [investigating, setInvestigating] = useState<{
    column: string;
    kind: InvestigationKind;
  } | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const recipeInputRef = useRef<HTMLInputElement>(null);

  // Dry-run every fixable diagnostic so each card shows its blast radius.
  const previews = useMemo(() => {
    const map = new Map<string, OpPreview>();
    if (!activeDataset) return map;
    for (const diag of activeDataset.diagnostics) {
      if (diag.fix) map.set(diag.id, previewCleanOp(activeDataset.rows, diag.fix.op));
    }
    return map;
  }, [activeDataset]);

  const counts = useMemo(
    () => (activeDataset ? qualityCounts(activeDataset) : null),
    [activeDataset]
  );

  // What "Auto-fix all" is actually able to do. Judgement calls (capping
  // outliers), findings with no mechanical remedy, and anything marked
  // intentional are not in it, so the button is never live with nothing behind
  // it and never undoes a decision the analyst already made.
  const autoFixable = useMemo(
    () => (activeDataset?.diagnostics ?? []).filter((d) => d.fix && !d.fix.manual && !d.skipped),
    [activeDataset]
  );

  const openFindings = useMemo(
    () => (activeDataset?.diagnostics ?? []).filter((d) => !d.skipped),
    [activeDataset]
  );
  const skippedFindings = useMemo(
    () => (activeDataset?.diagnostics ?? []).filter((d) => d.skipped),
    [activeDataset]
  );

  if (!mounted) {
    return (
      <div className={PAGE_CENTERED}>
        <p className="font-mono text-xs text-on-surface-variant">Initializing Nexora engine…</p>
      </div>
    );
  }

  if (!activeDataset || !counts) {
    return (
      <WorkspaceEmpty
        icon={Stethoscope}
        title="Nothing to diagnose yet"
        body="Dataset Doctor scores completeness, accuracy, validity, and consistency, then hands you a fix for each problem it finds. Choose a dataset to begin."
      />
    );
  }

  const handleApplyFix = async (diagId: string, op: CleanOp) => {
    setFixingId(diagId);
    await new Promise((r) => setTimeout(r, 300));
    applyFix(activeDataset.id, op);
    setFixingId(null);
  };

  const handleAutoFixAll = async () => {
    const queue = [...autoFixable];
    if (queue.length === 0) return;

    setFixingId("all");
    for (const diag of queue) {
      applyFix(activeDataset.id, diag.fix!.op);
      await new Promise((r) => setTimeout(r, 150));
    }
    setFixingId(null);

    // Report the real outcome, read back after the run rather than predicted
    // before it: each fix re-profiles the data, so findings can clear or
    // surface along the way. A finished run never looks like a dead button.
    const after =
      useNexora.getState().datasets.find((d) => d.id === activeDataset.id)?.diagnostics ?? [];
    const stillAutomatic = after.filter((d) => d.fix && !d.fix.manual).length;
    const yourCall = after.length - stillAutomatic;

    const parts: string[] = [];
    if (yourCall > 0) parts.push(`${yourCall} need${yourCall === 1 ? "s" : ""} your call`);
    if (stillAutomatic > 0) parts.push(`${stillAutomatic} surfaced behind them, so run it again`);

    notify(
      "success",
      `Applied ${queue.length} fix${queue.length === 1 ? "" : "es"}`,
      parts.length > 0
        ? `${parts.join(" and ")}.`
        : "Every finding on this dataset is now resolved."
    );
  };

  const handleExportRecipe = () => {
    const recipe = buildRecipe(activeDataset.name, activeDataset.recipe ?? []);
    const json = serializeRecipe(recipe);
    const filename = `${activeDataset.name.replace(/\.[^/.]+$/, "")}_recipe.json`;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    recordExport({ kind: "recipe", filename, datasetId: activeDataset.id, datasetName: activeDataset.name, content: json });
  };

  const handleApplyRecipeFile = async (file: File) => {
    setRecipeError(null);
    try {
      const recipe = parseRecipe(await file.text());
      applyRecipe(activeDataset.id, recipe.ops);
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : "Could not read recipe.");
    }
  };

  const overallScore = activeDataset.health.overall;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (overallScore / 100) * circumference;

  const DIMENSIONS = [
    {
      title: "Completeness",
      score: activeDataset.health.completeness,
      color: "#34d399",
      desc: "Share of non-empty cells across the dataset.",
      detail: `${counts.missing.toLocaleString("en-US")} empty cells in ${counts.columnsWithGaps} column${counts.columnsWithGaps === 1 ? "" : "s"}.`,
    },
    {
      title: "Accuracy",
      score: activeDataset.health.accuracy,
      color: "#c0c1ff",
      desc: "Numeric values within the expected 1.5×IQR range.",
      detail: `${counts.outliers.toLocaleString("en-US")} value${counts.outliers === 1 ? "" : "s"} outside the fences.`,
    },
    {
      title: "Validity",
      score: activeDataset.health.validity,
      color: "#fbbf24",
      desc: "Cells that match their inferred column type.",
      detail: `${counts.invalid.toLocaleString("en-US")} cell${counts.invalid === 1 ? "" : "s"} disagree with their column type.`,
    },
    {
      title: "Consistency",
      score: activeDataset.health.consistency,
      color: "#38bdf8",
      desc: "Cleanliness of whitespace, formats, and duplicates.",
      detail: `${counts.duplicates.toLocaleString("en-US")} duplicate row${counts.duplicates === 1 ? "" : "s"}, ${counts.formatIssues} column${counts.formatIssues === 1 ? "" : "s"} with format noise.`,
    },
  ];

  const OVERVIEW = [
    { label: "Missing values", value: counts.missing.toLocaleString("en-US"), sub: `${counts.missingPct.toFixed(2)}% of all cells`, tone: counts.missing > 0 ? "warn" : "ok" },
    { label: "Duplicate rows", value: counts.duplicates.toLocaleString("en-US"), sub: counts.duplicates > 0 ? "exact repeats of another row" : "no exact repeats", tone: counts.duplicates > 0 ? "warn" : "ok" },
    { label: "Outliers", value: counts.outliers.toLocaleString("en-US"), sub: "beyond the 1.5×IQR fence", tone: counts.outliers > 0 ? "warn" : "ok" },
    { label: "Type violations", value: counts.invalid.toLocaleString("en-US"), sub: "cells that fail their column type", tone: counts.invalid > 0 ? "warn" : "ok" },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className={`${PAGE_WIDE} select-none space-y-6`}
    >
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-on-surface-variant">
            <Stethoscope className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Step 1 · Data quality
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-white md:text-[28px]">
            Dataset Doctor
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            Quality report and cleaning controls for
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {activeDataset.name}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {undoDepth(activeDataset.id) > 0 && (
            <button
              type="button"
              onClick={() => undoFix(activeDataset.id)}
              disabled={fixingId !== null}
              className="pill h-10 border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08] disabled:opacity-40"
              title="Undo the last cleaning operation"
            >
              <Undo2 className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
              Undo
            </button>
          )}
          {(activeDataset.recipe?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={handleExportRecipe}
              className="pill h-10 border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08]"
              title="Save the applied fixes as a replayable recipe"
            >
              <FileJson className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
              Save recipe
            </button>
          )}
          <button
            type="button"
            onClick={() => recipeInputRef.current?.click()}
            disabled={fixingId !== null}
            className="pill h-10 border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08] disabled:opacity-40"
            title="Replay a saved cleaning recipe on this dataset"
          >
            <FileUp className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
            Apply recipe
          </button>
          <input
            ref={recipeInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleApplyRecipeFile(f);
              e.target.value = "";
            }}
          />
          {datasets.length > 1 && (
            <button
              type="button"
              onClick={() => setIsJoinOpen(true)}
              className="pill h-10 border border-white/10 bg-white/5 px-4 text-[13px] text-on-surface hover:bg-white/[0.08]"
            >
              <GitBranch className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
              Join
            </button>
          )}
          <button
            type="button"
            onClick={handleAutoFixAll}
            disabled={autoFixable.length === 0 || fixingId !== null}
            title={
              autoFixable.length === 0
                ? activeDataset.diagnostics.length === 0
                  ? "Nothing left to fix on this dataset"
                  : "The remaining findings need your judgement, so apply those one at a time below"
                : `Apply ${autoFixable.length} safe fix${autoFixable.length === 1 ? "" : "es"}`
            }
            className="pill h-10 bg-primary px-5 text-[13px] text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {fixingId === "all"
              ? "Auto-fixing…"
              : autoFixable.length > 0
                ? `Auto-fix ${autoFixable.length}`
                : "Auto-fix all"}
          </button>
        </div>
      </div>

      {recipeError && (
        <div className="nexora-card flex items-center gap-2 border-amber-400/30 p-3.5 text-xs text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Recipe error: {recipeError}
        </div>
      )}

      {activeDataset.truncated && <TruncationBanner rows={activeDataset.rows.length} />}

      <GettingStarted dataset={activeDataset} />

      <SectionNav sections={SECTIONS} />

      {/* ── Overview: the scorecard and the counts sit side by side, each in its
             own card, so neither can cover the other at any width. ── */}
      <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-32">
        <h2 id="overview-heading" className="px-1 pb-3 text-lg font-semibold tracking-tight text-white">
          Overview
        </h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="nexora-card flex flex-col p-6 lg:col-span-4">
            <h3 className="mb-2 text-[13px] font-medium text-on-surface-variant">Health score</h3>
            <div className="flex flex-1 flex-col items-center justify-center py-4">
              <div className="relative h-36 w-36">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r={radius} fill="none" stroke="#1b2030" strokeWidth="8" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: dashoffset }}
                    transition={{ duration: 1.3, ease: EASE_OUT }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[34px] font-semibold leading-none tabular-nums text-white">
                    {overallScore}
                  </span>
                  <span className="mt-1 text-[10px] uppercase tracking-wider text-on-surface-variant">
                    out of 100
                  </span>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] text-primary">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                {overallScore >= 90
                  ? "Production ready"
                  : overallScore >= 70
                    ? "Needs a few fixes"
                    : "Needs attention"}
              </div>
            </div>
            <p className="mt-auto border-t border-white/[0.06] pt-4 text-[11.5px] leading-relaxed text-on-surface-variant">
              The mean of the four dimensions below, weighted equally. Applying a fix recomputes it
              immediately.
              {skippedFindings.length > 0 && (
                <>
                  {" "}
                  <span className="text-emerald-300/90">
                    {skippedFindings.length} finding{skippedFindings.length === 1 ? "" : "s"} you
                    marked intentional {skippedFindings.length === 1 ? "is" : "are"} excluded.
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-8">
            {OVERVIEW.map((stat) => (
              <div key={stat.label} className="nexora-card p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-on-surface-variant">{stat.label}</p>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${stat.tone === "warn" ? "bg-amber-400" : "bg-emerald-400"}`}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{stat.value}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quality dimensions ── */}
      <section id="dimensions" aria-labelledby="dimensions-heading" className="scroll-mt-32">
        <h2 id="dimensions-heading" className="px-1 pb-3 text-lg font-semibold tracking-tight text-white">
          Quality dimensions
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {DIMENSIONS.map((m) => (
            <div key={m.title} className="nexora-card flex flex-col justify-between p-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{m.title}</h3>
                  <span className="font-mono text-sm tabular-nums text-white">{m.score}%</span>
                </div>
                <p className="text-xs leading-relaxed text-on-surface-variant">{m.desc}</p>
                <p className="mt-2 font-mono text-[11px] text-on-surface-variant/80">{m.detail}</p>
              </div>
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-black/30">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: m.color }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${m.score}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, ease: EASE_OUT }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Findings and fixes ── */}
      <section id="findings" aria-labelledby="findings-heading" className="scroll-mt-32">
        <div className="flex items-end justify-between px-1 pb-3">
          <h2 id="findings-heading" className="text-lg font-semibold tracking-tight text-white">
            Findings &amp; fixes
          </h2>
          <span className="font-mono text-[11px] text-on-surface-variant">
            {openFindings.length} open
            {skippedFindings.length > 0 && ` · ${skippedFindings.length} intentional`}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {openFindings.length === 0 ? (
            <div className="nexora-card flex flex-col items-center justify-center p-10 text-center lg:col-span-2">
              <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-400" aria-hidden="true" />
              <span className="text-sm font-semibold text-white">All clear</span>
              <span className="mt-1.5 max-w-[38ch] text-xs leading-relaxed text-on-surface-variant">
                {skippedFindings.length > 0
                  ? "Everything left has been marked intentional. This data is ready to summarize."
                  : "No anomalies, duplicate rows, or format issues detected. This data is safe to build a dashboard on."}
              </span>
            </div>
          ) : (
            openFindings.map((diag) => {
              const preview = previews.get(diag.id);
              return (
                <div key={diag.id} className="nexora-card flex items-start justify-between gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
                    <div>
                      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                        {diag.title}
                        {diag.fix?.manual && (
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                            Your call
                          </span>
                        )}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                        {diag.description}
                      </p>
                      {/* A finding with no mechanical remedy says what to do instead,
                          rather than sitting there with no control beside it. */}
                      {!diag.fix && diag.guidance && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
                          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
                          {diag.guidance}
                        </p>
                      )}
                      {preview && (preview.changedCells > 0 || preview.removedRows > 0) && (
                        <p className="mt-1.5 font-mono text-[11px] text-primary/80">
                          {preview.removedRows > 0
                            ? `will remove ${preview.removedRows} row(s)`
                            : `will change ${preview.changedCells} cell(s)`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {/* Investigate comes first, and deliberately. Fixing a gap
                        or capping an extreme destroys the evidence that would
                        have explained it, so the order of these buttons is the
                        order the work should happen in. */}
                    {(diag.rule === "missing" || diag.rule === "outlier") && diag.column && (
                      <button
                        type="button"
                        onClick={() =>
                          setInvestigating({
                            column: diag.column!,
                            kind: diag.rule === "missing" ? "missing" : "outlier",
                          })
                        }
                        className="press flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-400/10 px-3.5 py-2 text-[12px] font-medium text-sky-300 transition-colors hover:bg-sky-400/20"
                      >
                        <Microscope className="h-3.5 w-3.5" aria-hidden="true" />
                        Investigate
                      </button>
                    )}
                    {diag.fix && (
                      <button
                        type="button"
                        onClick={() => handleApplyFix(diag.id, diag.fix!.op)}
                        disabled={fixingId !== null}
                        title={
                          diag.fix.manual
                            ? "Left out of Auto-fix all on purpose. Undo is one click away."
                            : undefined
                        }
                        className="press w-full cursor-pointer rounded-lg border border-primary/20 bg-primary/12 px-3.5 py-2 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {fixingId === diag.id ? "Fixing…" : diag.fix.label}
                      </button>
                    )}
                    {/* Some findings are correct data. Saying so is a first-class
                        answer, not a workaround. */}
                    <button
                      type="button"
                      onClick={() => skipDiagnostic(activeDataset.id, diag.id, diag.title)}
                      disabled={fixingId !== null}
                      title="This is intentional. Stop counting it against the health score."
                      className="press cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface disabled:opacity-40"
                    >
                      Mark intentional
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {skippedFindings.length > 0 && (
          <div className="nexora-card mt-3 p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <h3 className="text-[13px] font-semibold text-white">Marked intentional</h3>
              <span className="text-[11px] text-on-surface-variant">
                still visible, no longer scored
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {skippedFindings.map((diag) => (
                <div
                  key={diag.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <span className="min-w-0 truncate text-[12px] text-on-surface-variant">
                    {diag.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => unskipDiagnostic(activeDataset.id, diag.id)}
                    className="press shrink-0 cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
                  >
                    Put back under review
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Cell-level detail, and the data itself ── */}
      <section id="cells" aria-labelledby="cells-heading" className="scroll-mt-32">
        <div className="px-1 pb-3">
          <h2 id="cells-heading" className="text-lg font-semibold tracking-tight text-white">
            Cells &amp; live preview
          </h2>
          <p className="mt-0.5 max-w-[74ch] text-xs leading-relaxed text-on-surface-variant">
            Every problem located by sheet, column, row, and cell reference. Preview a fix to see
            the exact before and after in the grid below before anything is committed.
          </p>
        </div>
        <LiveWorkbench dataset={activeDataset} />
      </section>

      {/* ── Columns and types ── */}
      <section id="schema" aria-labelledby="schema-heading" className="scroll-mt-32">
        <div className="flex items-end justify-between px-1 pb-3">
          <h2 id="schema-heading" className="text-lg font-semibold tracking-tight text-white">
            Columns &amp; types
          </h2>
          <span className="font-mono text-[11px] text-on-surface-variant">
            {activeDataset.columns.length} columns
          </span>
        </div>
        <div className="nexora-card overflow-hidden">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-surface-container-low">
                <tr className="border-b border-white/[0.06] text-on-surface-variant">
                  <th className="p-3.5 text-[11px] font-medium">Field</th>
                  <th className="p-3.5 text-[11px] font-medium">Inferred type</th>
                  <th className="p-3.5 text-center text-[11px] font-medium">Missing</th>
                  <th className="p-3.5 text-center text-[11px] font-medium">Distinct</th>
                  <th className="p-3.5 text-center text-[11px] font-medium">Valid</th>
                  <th className="p-3.5 text-center text-[11px] font-medium">Outliers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono text-[12px] text-on-surface-variant">
                {activeDataset.profiles?.map((col) => (
                  <tr key={col.name} className="transition-colors hover:bg-white/[0.02]">
                    <td className="p-3.5 font-medium text-white">{col.name}</td>
                    <td className="p-3.5 text-primary">{col.type}</td>
                    <td className="p-3.5 text-center">
                      {col.missingCount > 0 ? (
                        <span className="text-amber-400">{col.missingCount}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="p-3.5 text-center tabular-nums">{col.uniqueCount}</td>
                    <td className="p-3.5 text-center tabular-nums">
                      <span className={col.validity < 100 ? "text-amber-400" : ""}>
                        {col.validity.toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-3.5 text-center tabular-nums">
                      {col.outlierCount ? (
                        <span className="text-amber-400">{col.outlierCount}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Cleaning tools ── */}
      <section id="tools" aria-labelledby="tools-heading" className="scroll-mt-32 space-y-5">
        <div className="flex items-end justify-between px-1">
          <h2 id="tools-heading" className="text-lg font-semibold tracking-tight text-white">
            Cleaning tools
          </h2>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-on-surface-variant">
            <Layers className="h-3 w-3" aria-hidden="true" />
            {(activeDataset.recipe?.length ?? 0)} op(s) applied
          </span>
        </div>
        <TransformTools dataset={activeDataset} />
        <ValueReview dataset={activeDataset} />
      </section>

      <NextStep note="The data is scored and fixed. Next, read what it says: KPIs, trends, and breakdowns." />

      {isJoinOpen && <JoinCreatorModal isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} />}

      {investigating && (
        <InvestigationPanel
          dataset={activeDataset}
          column={investigating.column}
          kind={investigating.kind}
          onClose={() => setInvestigating(null)}
        />
      )}
    </motion.div>
  );
}
