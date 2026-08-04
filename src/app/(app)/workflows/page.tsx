"use client";

import { useRef, useState } from "react";
import {
  Workflow as WorkflowIcon,
  Play,
  Trash2,
  Pencil,
  Check,
  Plus,
  Download,
  Upload,
  GripVertical,
  X,
  Wand2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import {
  summarizeWorkflow,
  serializeWorkflow,
  parseWorkflow,
  moveStep,
  removeStep,
  type WorkflowTemplate,
} from "@/lib/workflow";
import { triggerDownload } from "@/lib/export-docx";

export default function WorkflowsPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const workflows = useNexora((s) => s.workflows);
  const pinnedCharts = useNexora((s) => s.pinnedCharts);
  const saveWorkflow = useNexora((s) => s.saveWorkflow);
  const updateWorkflow = useNexora((s) => s.updateWorkflow);
  const removeWorkflow = useNexora((s) => s.removeWorkflow);
  const importWorkflow = useNexora((s) => s.importWorkflow);
  const runWorkflow = useNexora((s) => s.runWorkflow);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!mounted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1440px] items-center justify-center p-6">
        <div className="font-mono text-xs text-on-surface-variant">Loading workflows…</div>
      </div>
    );
  }

  const capturedOps = activeDataset?.recipe?.length ?? 0;
  const capturedCharts = activeDataset ? (pinnedCharts[activeDataset.id]?.length ?? 0) : 0;
  const canCapture = capturedOps + capturedCharts > 0;

  const handleSave = () => {
    if (!activeDataset || !canCapture) return;
    saveWorkflow(name, description, activeDataset.id);
    setName("");
    setDescription("");
  };

  const handleExport = (template: WorkflowTemplate) => {
    triggerDownload(
      new Blob([serializeWorkflow(template)], { type: "application/json" }),
      `${template.name.replace(/[^\w-]+/g, "_")}_workflow.json`
    );
  };

  const handleImport = async (file: File) => {
    setImportError(null);
    try {
      importWorkflow(parseWorkflow(await file.text()));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read that workflow file.");
    }
  };

  const handleRun = (workflowId: string) => {
    if (!activeDataset) return;
    setLastRun(runWorkflow(activeDataset.id, workflowId));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="mx-auto max-w-[1100px] space-y-7 p-4 sm:p-6 md:p-8"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-white md:text-[28px]">
            Workflows
          </h1>
          <p className="text-sm text-on-surface-variant">
            Save a whole analysis once, then rebuild it on next month&apos;s file in one click.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-[13px] text-on-surface transition-colors hover:bg-white/[0.08]"
          >
            <Upload className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {importError && (
        <div className="nexora-card flex items-center gap-2 border-amber-400/30 p-3.5 text-xs text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {importError}
        </div>
      )}

      {lastRun && (
        <div className="nexora-card flex items-center gap-2 border-primary/30 p-3.5 text-xs text-primary">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          {lastRun}
        </div>
      )}

      {/* Capture the current dataset */}
      <section className="nexora-ai-card p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
          <Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />
          Save the current analysis as a template
        </h2>
        {activeDataset ? (
          <>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
              {canCapture ? (
                <>
                  Captures {capturedOps} cleaning step{capturedOps === 1 ? "" : "s"} and{" "}
                  {capturedCharts} pinned chart{capturedCharts === 1 ? "" : "s"} from{" "}
                  <span className="font-mono text-primary">{activeDataset.name}</span>.
                </>
              ) : (
                <>
                  Nothing to capture yet. Apply a fix in Dataset Doctor or pin a chart in Chart
                  Studio, then come back.
                </>
              )}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1.4fr_auto]">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Workflow name"
                aria-label="Workflow name"
                className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-[13px] text-white outline-none placeholder:text-on-surface-variant/70 focus:border-primary/50"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What it does (optional)"
                aria-label="Workflow description"
                className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-[13px] text-white outline-none placeholder:text-on-surface-variant/70 focus:border-primary/50"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!canCapture}
                className="pill h-10 bg-primary px-4 text-[13px] text-on-primary disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Save workflow
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-on-surface-variant">
              A workflow is a recording of what you did to a dataset. Load one first, clean it, then
              come back and save those steps as a template.
            </p>
            <Link
              href="/launch"
              className="pill mt-4 h-10 w-fit bg-primary px-4 text-[13px] text-on-primary"
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Choose a dataset
            </Link>
          </>
        )}
      </section>

      {/* Templates */}
      {workflows.length === 0 ? (
        <div className="nexora-card flex flex-col items-center justify-center p-12 text-center">
          <WorkflowIcon className="mb-3 h-8 w-8 text-on-surface-variant" aria-hidden="true" />
          <p className="text-sm font-semibold text-white">No saved workflows yet</p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-on-surface-variant">
            Clean a dataset, pin the charts you care about, then save it here. Applying it to a new
            export replays every step in order.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {workflows.map((template) => (
            <WorkflowCard
              key={template.id}
              template={template}
              editing={editingId === template.id}
              confirming={confirmDelete === template.id}
              canRun={!!activeDataset}
              activeDatasetName={activeDataset?.name}
              onEdit={() => setEditingId(editingId === template.id ? null : template.id)}
              onPatch={(patch) => updateWorkflow(template.id, patch)}
              onRun={() => handleRun(template.id)}
              onExport={() => handleExport(template)}
              onAskDelete={() =>
                setConfirmDelete(confirmDelete === template.id ? null : template.id)
              }
              onDelete={() => {
                removeWorkflow(template.id);
                setConfirmDelete(null);
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function WorkflowCard({
  template,
  editing,
  confirming,
  canRun,
  activeDatasetName,
  onEdit,
  onPatch,
  onRun,
  onExport,
  onAskDelete,
  onDelete,
}: {
  template: WorkflowTemplate;
  editing: boolean;
  confirming: boolean;
  canRun: boolean;
  activeDatasetName?: string;
  onEdit: () => void;
  onPatch: (patch: Partial<Pick<WorkflowTemplate, "name" | "description" | "steps">>) => void;
  onRun: () => void;
  onExport: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="nexora-card overflow-hidden">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                value={template.name}
                onChange={(e) => onPatch({ name: e.target.value })}
                aria-label="Workflow name"
                className="w-full rounded-lg border border-primary/30 bg-black/25 px-2.5 py-1.5 text-[15px] font-semibold text-white outline-none focus:border-primary/60"
              />
              <input
                value={template.description}
                onChange={(e) => onPatch({ description: e.target.value })}
                placeholder="Description"
                aria-label="Workflow description"
                className="w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[12.5px] text-on-surface outline-none focus:border-primary/50"
              />
            </div>
          ) : (
            <>
              <h3 className="truncate text-[15px] font-semibold text-white">{template.name}</h3>
              {template.description && (
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-on-surface-variant">
                  {template.description}
                </p>
              )}
            </>
          )}
          <p className="mt-1.5 font-mono text-[11px] text-on-surface-variant/80">
            {summarizeWorkflow(template)} · captured from {template.source}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            title={
              canRun
                ? `Apply to ${activeDatasetName}`
                : "Load a dataset before applying a workflow"
            }
            className="pill h-9 bg-primary px-3.5 text-[12.5px] text-on-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Apply
          </button>
          <IconButton label="Export workflow" onClick={onExport}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton label={editing ? "Done editing" : "Edit workflow"} onClick={onEdit} active={editing}>
            {editing ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </IconButton>
          <IconButton label="Delete workflow" onClick={onAskDelete} danger={confirming}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {confirming && (
        <div className="flex items-center justify-between gap-3 border-t border-red-400/20 bg-red-400/[0.06] px-5 py-3">
          <span className="text-[12.5px] text-red-200">
            Delete &quot;{template.name}&quot;? This cannot be undone.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAskDelete}
              className="press cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-on-surface-variant hover:text-on-surface"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="press cursor-pointer rounded-lg border border-red-400/30 bg-red-400/15 px-3 py-1.5 text-[12px] font-medium text-red-200 hover:bg-red-400/25"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Steps */}
      <ol className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
        {template.steps.length === 0 && (
          <li className="px-5 py-4 text-center text-[12px] text-on-surface-variant">
            This workflow has no steps left.
          </li>
        )}
        {template.steps.map((step, i) => (
          <li key={step.id} className="flex items-center gap-2.5 px-4 py-2.5 sm:gap-3 sm:px-5">
            <GripVertical
              className="hidden h-3.5 w-3.5 shrink-0 text-on-surface-variant/50 sm:block"
              aria-hidden="true"
            />
            <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-on-surface-variant">
              {i + 1}
            </span>
            <span
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                step.kind === "clean"
                  ? "border-tertiary/25 bg-tertiary/10 text-tertiary"
                  : "border-primary/25 bg-primary/10 text-primary"
              }`}
            >
              {step.kind}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-on-surface" title={step.label}>
              {step.label}
            </span>
            {editing && (
              <span className="flex shrink-0 items-center gap-0.5">
                <IconButton
                  label={`Move "${step.label}" up`}
                  onClick={() => onPatch({ steps: moveStep(template.steps, i, i - 1) })}
                  disabled={i === 0}
                  small
                >
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Move "${step.label}" down`}
                  onClick={() => onPatch({ steps: moveStep(template.steps, i, i + 1) })}
                  disabled={i === template.steps.length - 1}
                  small
                >
                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Remove "${step.label}"`}
                  onClick={() => onPatch({ steps: removeStep(template.steps, step.id) })}
                  small
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </IconButton>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active,
  danger,
  disabled,
  small,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`press flex ${small ? "h-7 w-7" : "h-9 w-9"} items-center justify-center rounded-lg border transition-colors ${
        disabled
          ? "cursor-not-allowed border-white/[0.06] text-on-surface-variant/30"
          : danger
            ? "cursor-pointer border-red-400/30 bg-red-400/10 text-red-300"
            : active
              ? "cursor-pointer border-primary/40 bg-primary/15 text-primary"
              : "cursor-pointer border-white/10 bg-white/[0.03] text-on-surface-variant hover:bg-white/[0.07] hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}
