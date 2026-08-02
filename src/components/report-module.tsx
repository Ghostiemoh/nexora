"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileBarChart, ArrowUpRight, FileText, FileType2, Printer } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { useNexora } from "@/lib/store";
import { buildDashboard } from "@/lib/auto-dashboard";
import { analyzeCached } from "@/lib/insights";
import { buildReport, reportToMarkdown, reportToHtml } from "@/lib/report";
import { downloadDocx, triggerDownload } from "@/lib/export-docx";

/** The report, on the dashboard. The full editable document lives at /reports;
 *  this is the summary plus one-click export so it never needs a detour. */
export function ReportModule({ dataset }: { dataset: Dataset }) {
  const recordExport = useNexora((s) => s.recordExport);
  const notify = useNexora((s) => s.notify);
  const [busy, setBusy] = useState<"md" | "docx" | null>(null);

  // Stamped once per mount; the dashboard renders nothing before it is mounted.
  const [generatedAt] = useState(() => new Date().toISOString());

  const report = useMemo(
    () => buildReport(dataset, analyzeCached(dataset), buildDashboard(dataset), generatedAt),
    [dataset, generatedAt]
  );

  const cleanName = dataset.name.replace(/\.[^/.]+$/, "");
  const summary = report.sections.find((s) => s.id === "executive-summary");

  const handleMarkdown = () => {
    setBusy("md");
    const md = reportToMarkdown(report);
    const filename = `${cleanName}_report.md`;
    triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), filename);
    recordExport({
      kind: "md",
      filename,
      datasetId: dataset.id,
      datasetName: dataset.name,
      content: md,
    });
    setBusy(null);
  };

  const handleWord = async () => {
    setBusy("docx");
    const filename = `${cleanName}_report.docx`;
    try {
      await downloadDocx(report, filename);
      recordExport({ kind: "md", filename, datasetId: dataset.id, datasetName: dataset.name });
    } catch {
      triggerDownload(
        new Blob([reportToHtml(report)], { type: "application/msword" }),
        `${cleanName}_report.doc`
      );
      notify(
        "warning",
        "Exported as .doc",
        "The .docx writer was unavailable, so the report was saved in the Word-compatible HTML format instead."
      );
    }
    setBusy(null);
  };

  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
          <FileBarChart className="h-4 w-4 text-primary" aria-hidden="true" />
          Report
        </h2>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          A full analyst report is already written for{" "}
          <span className="font-mono text-primary">{dataset.name}</span>. Export it here, or open it
          to edit the wording first.
        </p>
      </div>

      <div className="nexora-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold text-white">{report.title}</h3>
            {summary && (
              <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-on-surface-variant">
                {summary.body}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {report.sections.map((s) => (
                <span
                  key={s.id}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-on-surface-variant"
                >
                  {s.title}
                </span>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/reports" className="pill h-9 bg-primary px-3.5 text-[12.5px] text-on-primary">
              Open report
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={handleMarkdown}
              disabled={busy !== null}
              className="press flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-[12.5px] text-on-surface transition-colors hover:bg-white/[0.08] disabled:opacity-40"
            >
              <FileText className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden="true" />
              {busy === "md" ? "…" : "Markdown"}
            </button>
            <button
              type="button"
              onClick={handleWord}
              disabled={busy !== null}
              className="press flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-[12.5px] text-on-surface transition-colors hover:bg-white/[0.08] disabled:opacity-40"
            >
              <FileType2 className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
              {busy === "docx" ? "…" : "Word"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="press flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-[12.5px] text-on-surface transition-colors hover:bg-white/[0.08]"
            >
              <Printer className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden="true" />
              PDF
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
