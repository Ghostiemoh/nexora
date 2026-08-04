"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  FileText,
  Printer,
  FileType2,
  FileSpreadsheet,
  BarChart3,
  Pencil,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { WorkspaceEmpty } from "@/components/layout/workspace-empty";
import { IntelligencePanel } from "@/components/intelligence-panel";
import { AutoDashboard } from "@/components/auto-dashboard";
import { buildDashboard } from "@/lib/auto-dashboard";
import { analyzeCached } from "@/lib/insights";
import { buildReport, reportToMarkdown, reportToHtml, type Report } from "@/lib/report";
import { downloadDocx, triggerDownload } from "@/lib/export-docx";
import { downloadCsv, toCsv } from "@/lib/csv";

type Busy = "md" | "docx" | "csv" | null;

export default function ReportsPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const recordExport = useNexora((s) => s.recordExport);
  const notify = useNexora((s) => s.notify);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  // Stamped once per visit. The page renders nothing before `mounted`, so the
  // server never emits a timestamp that the client could disagree with.
  const [generatedAt] = useState(() => new Date().toISOString());
  const [edits, setEdits] = useState<Record<string, { title?: string; body?: string }>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const generated = useMemo(() => {
    if (!activeDataset) return null;
    return buildReport(
      activeDataset,
      analyzeCached(activeDataset),
      buildDashboard(activeDataset),
      generatedAt
    );
  }, [activeDataset, generatedAt]);

  // The generated report is the source of truth; user edits are layered on top,
  // so re-running the analysis never silently discards someone's wording.
  const report: Report | null = useMemo(() => {
    if (!generated) return null;
    return {
      ...generated,
      sections: generated.sections.map((s) => ({
        ...s,
        title: edits[s.id]?.title ?? s.title,
        body: edits[s.id]?.body ?? s.body,
        include: !hidden[s.id],
      })),
    };
  }, [generated, edits, hidden]);

  if (!mounted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1440px] items-center justify-center p-6">
        <div className="font-mono text-xs text-on-surface-variant">Compiling report engine…</div>
      </div>
    );
  }

  if (datasets.length === 0 || !activeDataset || !report) {
    return (
      <WorkspaceEmpty
        icon={BookOpen}
        title="No report yet"
        body="Nexora writes the whole thing for you: executive summary, data quality, KPIs, trends, findings, root causes, and recommendations, ready to export as PDF, Word, or Markdown."
      />
    );
  }

  const cleanName = activeDataset.name.replace(/\.[^/.]+$/, "");
  const includedCount = report.sections.filter((s) => s.include).length;

  const handleMarkdown = async () => {
    setBusy("md");
    const md = reportToMarkdown(report);
    const filename = `${cleanName}_report.md`;
    triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), filename);
    recordExport({
      kind: "md",
      filename,
      datasetId: activeDataset.id,
      datasetName: activeDataset.name,
      content: md,
    });
    setBusy(null);
  };

  const handleWord = async () => {
    setBusy("docx");
    const filename = `${cleanName}_report.docx`;
    try {
      await downloadDocx(report, filename);
      recordExport({
        kind: "md",
        filename,
        datasetId: activeDataset.id,
        datasetName: activeDataset.name,
      });
    } catch {
      // Word generation is the one export that can fail on an old browser;
      // fall back to a document Word opens rather than losing the work.
      const html = reportToHtml(report);
      const fallback = `${cleanName}_report.doc`;
      triggerDownload(new Blob([html], { type: "application/msword" }), fallback);
      notify(
        "warning",
        "Exported as .doc",
        "The .docx writer was unavailable, so the report was saved in the Word-compatible HTML format instead."
      );
    }
    setBusy(null);
  };

  const handleCsv = async () => {
    setBusy("csv");
    downloadCsv(`${cleanName}_cleaned`, activeDataset.columns, activeDataset.rows);
    recordExport({
      kind: "csv",
      filename: `${cleanName}_cleaned.csv`,
      datasetId: activeDataset.id,
      datasetName: activeDataset.name,
      content: toCsv(activeDataset.columns, activeDataset.rows),
    });
    setBusy(null);
  };

  const editSection = (id: string, patch: { title?: string; body?: string }) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const resetSection = (id: string) =>
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="mx-auto max-w-4xl space-y-7 p-4 sm:p-6 md:p-8"
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.06] pb-6 md:flex-row md:items-end">
        <div>
          <span className="no-print mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-on-surface-variant">
            <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Step 3 · Reporting
          </span>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-white md:text-[28px]">
            {report.title}
          </h1>
          <p className="text-sm text-on-surface-variant">
            Written automatically from{" "}
            <span className="font-mono text-primary">{activeDataset.name}</span>. Every section is
            editable before you export.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            title="Print or save as PDF"
            className="press flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3.5 text-[13px] text-on-surface transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Printer className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
            PDF
          </button>
          <button
            type="button"
            onClick={handleWord}
            disabled={busy !== null}
            className="press flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3.5 text-[13px] text-on-surface transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-40"
          >
            <FileType2 className="h-4 w-4 text-sky-300" aria-hidden="true" />
            {busy === "docx" ? "Writing…" : "Word"}
          </button>
          <button
            type="button"
            onClick={handleMarkdown}
            disabled={busy !== null}
            className="pill h-10 bg-primary px-4 text-[13px] text-on-primary disabled:opacity-40"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {busy === "md" ? "Compiling…" : "Markdown"}
          </button>
          <button
            type="button"
            onClick={handleCsv}
            disabled={busy !== null}
            className="press flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3.5 text-[13px] text-on-surface transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Clean CSV
          </button>
        </div>
      </div>

      <p className="no-print -mt-3 text-[11px] text-on-surface-variant/80">
        {includedCount} of {report.sections.length} sections included in exports · generated{" "}
        {report.generatedAt.slice(0, 10)}
      </p>

      {/* The document */}
      <div className="space-y-5">
        {report.sections.map((section) => {
          const isEditing = editingId === section.id;
          const isEdited = Boolean(edits[section.id]);

          return (
            <article
              key={section.id}
              className={`nexora-card p-6 transition-opacity ${section.include ? "" : "opacity-45"}`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                {isEditing ? (
                  <input
                    value={section.title}
                    onChange={(e) => editSection(section.id, { title: e.target.value })}
                    aria-label="Section title"
                    className="min-w-0 flex-1 rounded-lg border border-primary/30 bg-black/25 px-2.5 py-1.5 text-[17px] font-semibold text-white outline-none focus:border-primary/60"
                  />
                ) : (
                  <h2 className="min-w-0 flex-1 text-[17px] font-semibold tracking-tight text-white">
                    {section.title}
                    {isEdited && (
                      <span className="ml-2 align-middle text-[10px] font-normal uppercase tracking-wider text-primary">
                        edited
                      </span>
                    )}
                  </h2>
                )}

                <div className="no-print flex shrink-0 items-center gap-1">
                  {isEdited && (
                    <button
                      type="button"
                      onClick={() => resetSection(section.id)}
                      title="Restore the generated wording"
                      aria-label={`Restore generated wording for ${section.title}`}
                      className="press flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface sm:h-8 sm:w-8"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setHidden((prev) => ({ ...prev, [section.id]: !prev[section.id] }))
                    }
                    title={section.include ? "Exclude from exports" : "Include in exports"}
                    aria-label={
                      section.include
                        ? `Exclude ${section.title} from exports`
                        : `Include ${section.title} in exports`
                    }
                    aria-pressed={!section.include}
                    className="press flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface sm:h-8 sm:w-8"
                  >
                    {section.include ? (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : section.id)}
                    title={isEditing ? "Done editing" : "Edit this section"}
                    aria-label={isEditing ? "Done editing" : `Edit ${section.title}`}
                    className={`press flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors sm:h-8 sm:w-8 ${
                      isEditing
                        ? "bg-primary/15 text-primary"
                        : "text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
                    }`}
                  >
                    {isEditing ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <textarea
                  value={section.body}
                  onChange={(e) => editSection(section.id, { body: e.target.value })}
                  rows={Math.max(3, Math.ceil(section.body.length / 90))}
                  aria-label="Section text"
                  className="w-full resize-y rounded-lg border border-primary/30 bg-black/25 p-3 text-[13px] leading-relaxed text-on-surface outline-none focus:border-primary/60"
                />
              ) : (
                section.body.trim() && (
                  <p className="text-[13px] leading-relaxed text-on-surface">{section.body}</p>
                )
              )}

              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {section.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[12.5px] leading-relaxed text-on-surface-variant"
                    >
                      <span
                        className={`shrink-0 text-primary ${section.ordered ? "tabular-nums" : ""}`}
                      >
                        {section.ordered ? `${i + 1}.` : "▸"}
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {section.table && section.table.rows.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
                  <table className="w-full border-collapse text-left text-[11.5px]">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02] text-on-surface-variant">
                        {section.table.headers.map((h) => (
                          <th key={h} className="p-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] text-on-surface-variant">
                      {section.table.rows.map((row, i) => (
                        <tr key={i} className="transition-colors hover:bg-white/[0.02]">
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              className={`p-2.5 align-top ${j === 0 ? "font-medium text-white" : ""}`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* The findings behind the wording, each with the evidence attached */}
      <IntelligencePanel dataset={activeDataset} />

      {/* Visual appendix, included in the printed PDF */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 px-1 text-[17px] font-semibold tracking-tight text-white">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          Visual appendix
        </h2>
        <AutoDashboard dataset={activeDataset} interactive={false} />
      </div>

      <div className="border-t border-white/[0.06] pb-2 pt-5 text-center">
        <p className="font-mono text-[11px] text-on-surface-variant">
          Generated locally with Nexora. This data never left the machine that produced the report.
        </p>
        <p className="mt-1 font-mono text-[10px] text-on-surface-variant/70">
          {report.generatedAt.slice(0, 10)} · {activeDataset.rows.length} rows ·{" "}
          {activeDataset.columns.length} columns · health {activeDataset.health.overall}%
        </p>
      </div>
    </motion.div>
  );
}
