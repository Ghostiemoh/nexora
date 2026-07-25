"use client";

import { useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Database,
  GitBranch,
  Undo2,
  FileJson,
  FileUp,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { UploadDropzone } from "@/components/upload-dropzone";
import { JoinCreatorModal } from "@/components/layout/join-creator-modal";
import { TruncationBanner } from "@/components/truncation-banner";
import { AutoDashboard } from "@/components/auto-dashboard";
import { ValueReview } from "@/components/value-review";
import { TransformTools } from "@/components/transform-tools";
import { buildRecipe, serializeRecipe, parseRecipe, previewCleanOp, type OpPreview } from "@/lib/recipe";
import type { CleanOp } from "@/lib/types";
import { motion } from "framer-motion";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export default function DashboardPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const applyFix = useNexora((s) => s.applyFix);
  const undoFix = useNexora((s) => s.undoFix);
  const undoDepth = useNexora((s) => s.undoDepth);
  const applyRecipe = useNexora((s) => s.applyRecipe);
  const recordExport = useNexora((s) => s.recordExport);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  const [fixingId, setFixingId] = useState<string | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
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

  if (!mounted) {
    return (
      <div className="p-8 max-w-[1440px] mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-on-surface-variant font-mono text-xs">Initializing Nexora engine…</div>
      </div>
    );
  }

  // ── Empty state ──
  if (datasets.length === 0 || !activeDataset) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="p-8 max-w-[1440px] mx-auto min-h-[80vh] flex flex-col justify-center items-center"
      >
        <div className="max-w-xl w-full text-center space-y-6">
          <div className="space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Database className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Start with a dataset</h2>
            <p className="text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              Drop a CSV, TSV, JSON, or Excel file. Nexora profiles it, flags anomalies, and gets it
              ready to query, all in your browser.
            </p>
          </div>

          <div className="nexora-card p-6 border-dashed">
            <UploadDropzone />
          </div>

          <p className="text-[11px] text-on-surface-variant/70">
            Runs 100% locally. Nothing leaves your machine.
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Handlers ──
  const handleApplyFix = async (diagId: string, op: CleanOp) => {
    setFixingId(diagId);
    await new Promise((r) => setTimeout(r, 300));
    applyFix(activeDataset.id, op);
    setFixingId(null);
  };

  const handleAutoFixAll = async () => {
    setFixingId("all");
    for (const diag of [...activeDataset.diagnostics]) {
      if (diag.fix?.op) {
        applyFix(activeDataset.id, diag.fix.op);
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    setFixingId(null);
  };

  const handleUndo = () => {
    undoFix(activeDataset.id);
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

  // ── Gauge ──
  const overallScore = activeDataset.health.overall;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (overallScore / 100) * circumference;

  const METRICS = [
    { title: "Completeness", score: activeDataset.health.completeness, color: "#34d399", desc: "Share of non-empty cells across the dataset." },
    { title: "Accuracy", score: activeDataset.health.accuracy, color: "#c0c1ff", desc: "Numeric values within the expected 1.5×IQR range." },
    { title: "Validity", score: activeDataset.health.validity, color: "#fbbf24", desc: "Cells that match their inferred column type." },
    { title: "Consistency", score: activeDataset.health.consistency, color: "#38bdf8", desc: "Cleanliness of whitespace, formats, and dupes." },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="p-6 md:p-8 max-w-[1440px] mx-auto space-y-7 select-none"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-semibold text-white tracking-tight mb-1.5">
            Dataset Doctor
          </h1>
          <p className="text-sm text-on-surface-variant flex items-center gap-2 flex-wrap">
            Health and cleaning controls for
            <span className="font-mono text-primary text-xs bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
              {activeDataset.name}
            </span>
          </p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          {undoDepth(activeDataset.id) > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={fixingId !== null}
              className="pill h-10 px-4 bg-white/5 border border-white/10 text-on-surface text-[13px] hover:bg-white/[0.08] disabled:opacity-40"
              title="Undo the last cleaning operation"
            >
              <Undo2 className="w-4 h-4 text-on-surface-variant" />
              Undo
            </button>
          )}
          {(activeDataset.recipe?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={handleExportRecipe}
              className="pill h-10 px-4 bg-white/5 border border-white/10 text-on-surface text-[13px] hover:bg-white/[0.08]"
              title="Save the applied fixes as a replayable recipe"
            >
              <FileJson className="w-4 h-4 text-on-surface-variant" />
              Save recipe
            </button>
          )}
          <button
            type="button"
            onClick={() => recipeInputRef.current?.click()}
            disabled={fixingId !== null}
            className="pill h-10 px-4 bg-white/5 border border-white/10 text-on-surface text-[13px] hover:bg-white/[0.08] disabled:opacity-40"
            title="Replay a saved cleaning recipe on this dataset"
          >
            <FileUp className="w-4 h-4 text-on-surface-variant" />
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
              className="pill h-10 px-4 bg-white/5 border border-white/10 text-on-surface text-[13px] hover:bg-white/[0.08]"
            >
              <GitBranch className="w-4 h-4 text-on-surface-variant" />
              Join
            </button>
          )}
          <button
            type="button"
            onClick={handleAutoFixAll}
            disabled={activeDataset.diagnostics.length === 0 || fixingId !== null}
            className="pill h-10 px-5 bg-primary text-on-primary text-[13px] disabled:opacity-40 disabled:pointer-events-none"
          >
            <Sparkles className="w-4 h-4" />
            {fixingId === "all" ? "Auto-fixing…" : "Auto-fix all"}
          </button>
        </div>
      </div>

      {recipeError && (
        <div className="nexora-card p-3.5 border-amber-400/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Recipe error: {recipeError}
        </div>
      )}

      {activeDataset.truncated && <TruncationBanner rows={activeDataset.rows.length} />}

      {/* Overview */}
      <h2 className="text-lg font-semibold text-white tracking-tight px-1 -mb-3">Overview</h2>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Health gauge */}
        <div className="nexora-card lg:col-span-4 p-6 flex flex-col">
          <h3 className="text-[13px] font-medium text-on-surface-variant mb-2">Health score</h3>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
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
                <span className="font-semibold text-[34px] text-white leading-none tabular-nums">
                  {overallScore}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant mt-1">
                  out of 100
                </span>
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 text-primary text-[11px] bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              <TrendingUp className="w-3.5 h-3.5" />
              {overallScore >= 90 ? "Production ready" : overallScore >= 70 ? "Needs a few fixes" : "Needs attention"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/[0.06] mt-auto">
            <div>
              <p className="text-[11px] text-on-surface-variant">Anomalies</p>
              <p className="text-base font-semibold text-white tabular-nums">
                {activeDataset.diagnostics.length}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-on-surface-variant">Consistency</p>
              <p className="text-base font-semibold text-white tabular-nums">
                {activeDataset.health.consistency}%
              </p>
            </div>
          </div>
        </div>

        {/* Metric breakdown */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {METRICS.map((m) => (
            <div key={m.title} className="nexora-card nexora-card-interactive p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-white text-sm">{m.title}</h4>
                  <span className="font-mono text-sm text-white tabular-nums">{m.score}%</span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">{m.desc}</p>
              </div>
              <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden mt-6">
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
      </div>

      {/* Diagnostics + schema */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 space-y-3">
          <h3 className="text-[13px] font-medium text-on-surface-variant px-1">Diagnostics</h3>
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {activeDataset.diagnostics.length === 0 ? (
              <div className="nexora-card p-10 flex flex-col items-center justify-center text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-3" />
                <span className="text-sm font-semibold text-white">All clear</span>
                <span className="text-xs text-on-surface-variant mt-1.5 max-w-[30ch] leading-relaxed">
                  No anomalies, duplicate rows, or format issues detected.
                </span>
              </div>
            ) : (
              activeDataset.diagnostics.map((diag) => (
                <div
                  key={diag.id}
                  className="nexora-card p-4 flex justify-between items-start gap-4"
                >
                  <div className="flex gap-3 items-start">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-white text-sm">{diag.title}</h4>
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                        {diag.description}
                      </p>
                      {(() => {
                        const p = previews.get(diag.id);
                        if (!p || (p.changedCells === 0 && p.removedRows === 0)) return null;
                        return (
                          <p className="text-[11px] font-mono text-primary/80 mt-1.5">
                            {p.removedRows > 0
                              ? `will remove ${p.removedRows} row(s)`
                              : `will change ${p.changedCells} cell(s)`}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  {diag.fix && (
                    <button
                      type="button"
                      onClick={() => handleApplyFix(diag.id, diag.fix!.op)}
                      disabled={fixingId !== null}
                      className="press shrink-0 px-3.5 py-2 rounded-lg bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer transition-colors disabled:opacity-40"
                    >
                      {fixingId === diag.id ? "Fixing…" : diag.fix.label}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Schema */}
        <div className="lg:col-span-6 space-y-3">
          <h3 className="text-[13px] font-medium text-on-surface-variant px-1">Schema</h3>
          <div className="nexora-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-on-surface-variant">
                    <th className="p-3.5 font-medium text-[11px]">Field</th>
                    <th className="p-3.5 font-medium text-[11px]">Type</th>
                    <th className="p-3.5 font-medium text-[11px] text-center">Missing</th>
                    <th className="p-3.5 font-medium text-[11px] text-center">Distinct</th>
                    <th className="p-3.5 font-medium text-[11px] text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] font-mono text-[12px] text-on-surface-variant">
                  {activeDataset.profiles?.map((col) => (
                    <tr key={col.name} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3.5 text-white font-medium">{col.name}</td>
                      <td className="p-3.5 text-primary">{col.type}</td>
                      <td className="p-3.5 text-center">
                        {col.missingCount > 0 ? (
                          <span className="text-amber-400">{col.missingCount}</span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="p-3.5 text-center tabular-nums">{col.uniqueCount}</td>
                      <td className="p-3.5 text-center">
                        <div className="flex justify-center">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              col.missingCount === 0 ? "bg-emerald-400" : "bg-amber-400"
                            }`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Excel tools: Find & Replace, Text to Columns */}
      <TransformTools dataset={activeDataset} />

      {/* Manual review of rare values the auto-fixer couldn't safely merge */}
      <ValueReview dataset={activeDataset} />

      {/* Auto dashboard — every chart the dataset supports, generated automatically */}
      <div className="space-y-3 pt-2">
        <div className="flex items-end justify-between px-1">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Auto dashboard</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              KPIs, splits, distributions, and trends — built automatically from{" "}
              <span className="font-mono text-primary">{activeDataset.name}</span>. No setup.
            </p>
          </div>
        </div>
        <AutoDashboard dataset={activeDataset} />
      </div>

      {isJoinOpen && <JoinCreatorModal isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} />}
    </motion.div>
  );
}
