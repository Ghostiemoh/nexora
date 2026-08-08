"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Database,
  FolderOpen,
  Plus,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { UploadDropzone } from "@/components/upload-dropzone";
import { PeriodCloseCard } from "@/components/period-close";
import { fileTypeOf, formatStamp, relativeTime, describeDataset, wasModified } from "@/lib/dataset-meta";
import type { Dataset } from "@/lib/types";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const PREVIEW_ROWS = 5;
const PREVIEW_COLS = 6;

/** The first few rows of a dataset, so "is this the right file" is answerable
 *  without opening it. */
function QuickPreview({ dataset }: { dataset: Dataset }) {
  const columns = dataset.columns.slice(0, PREVIEW_COLS);
  const rows = dataset.rows.slice(0, PREVIEW_ROWS);
  const hiddenColumns = dataset.columns.length - columns.length;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11.5px]">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-on-surface-variant">
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap p-2.5 font-medium">
                  {column}
                </th>
              ))}
              {hiddenColumns > 0 && (
                <th className="whitespace-nowrap p-2.5 font-medium text-on-surface-variant/60">
                  +{hiddenColumns} more
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05] font-mono text-on-surface-variant">
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((column) => (
                  <td key={column} className="max-w-[180px] truncate p-2.5">
                    {row[column] === null || row[column] === undefined || String(row[column]).trim() === "" ? (
                      <span className="text-on-surface-variant/40">empty</span>
                    ) : (
                      String(row[column])
                    )}
                  </td>
                ))}
                {hiddenColumns > 0 && <td className="p-2.5 text-on-surface-variant/40">…</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-white/[0.06] bg-white/[0.01] px-2.5 py-1.5 font-mono text-[10px] text-on-surface-variant/70">
        First {rows.length} of {dataset.rows.length.toLocaleString("en-US")} rows
      </p>
    </div>
  );
}

function DatasetRow({
  dataset,
  now,
  isActive,
  onContinue,
  onRemove,
}: {
  dataset: Dataset;
  now: number;
  isActive: boolean;
  onContinue: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const type = fileTypeOf(dataset.name);
  const modified = wasModified(dataset);

  return (
    <div className={`nexora-card p-4 ${isActive ? "border-primary/30" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-white">{dataset.name}</h3>
            <span
              title={type.description}
              className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant"
            >
              {type.label}
            </span>
            {isActive && (
              <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                In use
              </span>
            )}
          </div>

          <p className="mt-1.5 font-mono text-[11.5px] text-on-surface-variant">
            {describeDataset(dataset)}
          </p>

          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-on-surface-variant/80">
            <div className="flex gap-1.5">
              <dt className="text-on-surface-variant/60">Uploaded</dt>
              <dd title={formatStamp(dataset.createdAt)}>{relativeTime(dataset.createdAt, now)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-on-surface-variant/60">Last modified</dt>
              <dd title={formatStamp(dataset.updatedAt)}>
                {modified ? relativeTime(dataset.updatedAt, now) : "unchanged since import"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="press flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[12.5px] text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            Preview
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${dataset.name} from the workspace`}
            className="press flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-on-surface-variant transition-colors hover:border-red-400/40 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="pill h-9 bg-primary px-4 text-[12.5px] text-on-primary"
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && <QuickPreview dataset={dataset} />}
    </div>
  );
}

export default function LaunchPage() {
  const mounted = useMounted();
  const router = useRouter();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const setActive = useNexora((s) => s.setActive);
  const removeDataset = useNexora((s) => s.removeDataset);

  // Stamped once per visit so the relative times never disagree between the
  // server pass and the client.
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState<"choose" | "upload">("choose");

  if (!mounted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1100px] items-center justify-center p-8">
        <p className="font-mono text-xs text-on-surface-variant">Reading local workspace…</p>
      </div>
    );
  }

  const open = (id: string) => {
    setActive(id);
    router.push("/dataset-doctor");
  };

  const recent = [...datasets].sort((a, b) => b.updatedAt - a.updatedAt);
  const showUpload = mode === "upload" || recent.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="mx-auto max-w-[1100px] space-y-7 p-4 sm:p-6 md:p-8"
    >
      <header className="space-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-on-surface-variant">
          <FolderOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Workspace
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-white md:text-[30px]">
          What would you like to do?
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-on-surface-variant">
          Nexora keeps every dataset you have loaded on this device. Pick up where you left off, or
          start a fresh analysis. Nothing opens until you choose.
        </p>
      </header>

      {/* Surfaced before the two paths: when this month's file is a repeat, the
          close is the shortest route through the whole workspace. */}
      <PeriodCloseCard />

      {/* The two paths */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("choose")}
          disabled={recent.length === 0}
          aria-pressed={!showUpload}
          className={`nexora-card nexora-card-interactive p-5 text-left disabled:cursor-not-allowed disabled:opacity-45 ${
            !showUpload ? "border-primary/30" : "cursor-pointer"
          }`}
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-[15px] font-semibold text-white">Continue with a previous dataset</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-on-surface-variant">
            {recent.length === 0
              ? "Nothing loaded on this device yet."
              : `${recent.length} dataset${recent.length === 1 ? "" : "s"} ready, with every fix you already applied.`}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("upload")}
          aria-pressed={showUpload}
          className={`nexora-card nexora-card-interactive cursor-pointer p-5 text-left ${
            showUpload ? "border-primary/30" : ""
          }`}
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-[15px] font-semibold text-white">Upload a new dataset</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-on-surface-variant">
            CSV, TSV, JSON, or an Excel workbook. Parsed in this tab, never uploaded anywhere.
          </p>
        </button>
      </div>

      {showUpload ? (
        <section className="nexora-card" aria-label="Upload a dataset">
          <UploadDropzone onLoaded={open} />
        </section>
      ) : (
        <section className="space-y-3" aria-label="Previous datasets">
          <div className="flex items-end justify-between px-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-white">Dataset history</h2>
            <span className="font-mono text-[11px] text-on-surface-variant">
              most recently touched first
            </span>
          </div>

          {recent.map((dataset) => (
            <DatasetRow
              key={dataset.id}
              dataset={dataset}
              now={now}
              isActive={dataset.id === activeId}
              onContinue={() => open(dataset.id)}
              onRemove={() => removeDataset(dataset.id)}
            />
          ))}
        </section>
      )}

      {/* Where a chosen dataset takes you */}
      <section className="nexora-card p-5">
        <h2 className="text-[13px] font-semibold text-white">What happens next</h2>
        <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["Dataset Doctor", "Score the data, then fix what is broken.", Stethoscope, "/dataset-doctor"],
            ["Dashboard", "KPIs and charts chosen for this data.", Database, "/dashboard"],
            ["Reports", "The written analysis, ready to export.", FolderOpen, "/reports"],
          ].map(([title, detail, Icon, href], i) => {
            const Glyph = Icon as typeof Stethoscope;
            return (
              <li key={title as string}>
                <Link
                  href={href as string}
                  className="press flex h-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-colors hover:border-primary/25 hover:bg-primary/[0.04]"
                >
                  <span className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <Glyph className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden="true" />
                  </span>
                  <span className="text-[12.5px] font-medium text-white">{title as string}</span>
                  <span className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">
                    {detail as string}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </motion.div>
  );
}
