"use client";

import { useState } from "react";
import {
  BookOpen,
  FileText,
  Database,
  CheckCircle2,
  FileSpreadsheet,
  Printer,
  BarChart3,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { UploadDropzone } from "@/components/upload-dropzone";
import { AutoDashboard } from "@/components/auto-dashboard";
import { downloadCsv, toCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/export-xlsx";
import { motion } from "framer-motion";

export default function ReportsPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;
  const recordExport = useNexora((s) => s.recordExport);
  const [downloading, setDownloading] = useState<"md" | "csv" | "xlsx" | null>(null);

  if (!mounted) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-500 font-mono text-xs">
          Loading Report Compiler Environment...
        </div>
      </div>
    );
  }

  // 1. EMPTY STATE
  if (datasets.length === 0 || !activeDataset) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className="p-6 max-w-[1440px] mx-auto min-h-[80vh] flex flex-col justify-center items-center"
      >
        <div className="max-w-xl w-full text-center space-y-6">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(192,193,255,0.15)] shadow-[inset_0_1px_rgba(255,255,255,0.05)]">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white font-headline-md">
              Analytical Report Center
            </h2>
            <p className="text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              Ingest a data source to generate compiled Markdown summaries and download cleaned CSV structures.
            </p>
          </div>

          <div className="bg-zinc-950/40 border border-dashed border-white/10 hover:border-primary/40 rounded-2xl p-6 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300">
            <UploadDropzone />
          </div>
        </div>
      </motion.div>
    );
  }

  const cleanName = activeDataset.name.replace(/\.[^/.]+$/, "");

  // Generate Markdown report string
  const generateMarkdownReport = () => {
    const header = `# Nexora OS Analytics Report - ${cleanName}\n\n`;
    const metadata = `## Dataset Profile Summary
- **Rows:** ${activeDataset.rows.length}
- **Columns:** ${activeDataset.columns.length}
- **Overall Health Score:** ${activeDataset.health.overall}%
- **Duplicate Rows:** ${activeDataset.duplicateRows}
- **Anomalies Count:** ${activeDataset.diagnostics.length}\n\n`;

    let columnsTable = `## Field Profiling Metadata
| Column Name | Inferred Type | Completeness | Uniqueness | Missing Values | Validity |
| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    activeDataset.profiles?.forEach((col) => {
      columnsTable += `| **${col.name}** | \`${col.type}\` | ${col.completeness.toFixed(1)}% | ${col.uniqueness.toFixed(1)}% | ${col.missingCount} | ${col.validity.toFixed(1)}% |\n`;
    });
    columnsTable += "\n";

    let changelogSec = `## Data Cleaning Audit Trail\n`;
    activeDataset.changelog.forEach((log, idx) => {
      changelogSec += `${idx + 1}. ${log}\n`;
    });

    return `${header}${metadata}${columnsTable}${changelogSec}`;
  };

  // Trigger file downloads in browser
  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMD = async () => {
    setDownloading("md");
    await new Promise((r) => setTimeout(r, 400));
    const md = generateMarkdownReport();
    triggerDownload(md, `${cleanName}_report.md`, "text/markdown;charset=utf-8;");
    recordExport({ kind: "md", filename: `${cleanName}_report.md`, datasetId: activeDataset.id, datasetName: activeDataset.name, content: md });
    setDownloading(null);
  };

  const handleDownloadCSV = async () => {
    setDownloading("csv");
    await new Promise((r) => setTimeout(r, 400));
    downloadCsv(`${cleanName}_cleaned`, activeDataset.columns, activeDataset.rows);
    recordExport({
      kind: "csv",
      filename: `${cleanName}_cleaned.csv`,
      datasetId: activeDataset.id,
      datasetName: activeDataset.name,
      content: toCsv(activeDataset.columns, activeDataset.rows),
    });
    setDownloading(null);
  };

  const handleDownloadXlsx = async () => {
    setDownloading("xlsx");
    await new Promise((r) => setTimeout(r, 400));
    downloadXlsx(activeDataset);
    recordExport({ kind: "xlsx", filename: `${cleanName}_cleaned.xlsx`, datasetId: activeDataset.id, datasetName: activeDataset.name });
    setDownloading(null);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="p-8 max-w-4xl mx-auto space-y-8 select-none"
    >
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight leading-tight mb-1">
            Analytical Report Center
          </h2>
          <p className="text-sm text-on-surface-variant">
            Export audit summaries and compiled Markdown dashboards for your cleaned data structures.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap no-print">
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 border border-white/10 hover:border-primary/40 hover:bg-primary/5 rounded-xl text-white font-mono text-xs uppercase tracking-wider font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer flex items-center gap-2"
            title="Print or save as PDF"
          >
            <Printer className="w-4 h-4 text-zinc-400" />
            PDF
          </button>
          <button
            onClick={handleDownloadXlsx}
            disabled={downloading !== null}
            className="px-4 py-2.5 border border-white/10 hover:border-primary/40 hover:bg-primary/5 rounded-xl text-white font-mono text-xs uppercase tracking-wider font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer flex items-center gap-2"
            title="Cleaned data + audit trail as a two-sheet workbook"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            {downloading === "xlsx" ? "Exporting..." : "XLSX + Audit"}
          </button>
          <button
            onClick={handleDownloadMD}
            disabled={downloading !== null}
            className="px-4 py-2.5 bg-primary text-black font-bold hover:bg-primary-fixed disabled:bg-zinc-900 disabled:text-zinc-500 disabled:border-white/5 rounded-xl text-xs font-mono uppercase tracking-wider transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer flex items-center gap-2 shadow-lg"
          >
            <FileText className="w-4 h-4" />
            {downloading === "md" ? "Compiling..." : "Download Report (.md)"}
          </button>
          <button
            onClick={handleDownloadCSV}
            disabled={downloading !== null}
            className="px-4 py-2.5 border border-white/10 hover:border-primary/40 hover:bg-primary/5 rounded-xl text-white font-mono text-xs uppercase tracking-wider font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-zinc-400" />
            {downloading === "csv" ? "Exporting..." : "Export Clean CSV"}
          </button>
        </div>
      </div>

      {/* Preview Markdown Document */}
      <div className="space-y-3">
        <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block">
          Document Output Preview: {cleanName}_report.md
        </label>
        
        <div className="nexora-card p-8 font-sans text-on-surface text-sm overflow-y-auto max-h-[600px] leading-relaxed shadow-2xl relative overflow-hidden space-y-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

          {/* Mock Markdown Document Rendered */}
          <div className="border-b border-white/5 pb-4 relative z-10">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Nexora OS Analytics Report - {cleanName}
            </h1>
            <span className="text-[10px] text-zinc-500 font-mono uppercase block mt-1 tracking-wider">
              Compiled locally via Nexora Engine
            </span>
          </div>

          <div className="space-y-3 relative z-10">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Dataset Profile Summary
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400 text-xs font-mono">
              <li>
                Rows count: <span className="text-white font-semibold">{activeDataset.rows.length}</span>
              </li>
              <li>
                Columns count: <span className="text-white font-semibold">{activeDataset.columns.length}</span>
              </li>
              <li>
                Overall Health Score:{" "}
                <span className="text-primary font-bold">{activeDataset.health.overall}%</span>
              </li>
              <li>
                Duplicate Rows: <span className="text-white font-semibold">{activeDataset.duplicateRows}</span>
              </li>
              <li>
                Diagnostics Warnings Detected:{" "}
                <span className="text-white font-semibold">{activeDataset.diagnostics.length}</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3 relative z-10">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Field Profiling Metadata
            </h2>
            <div className="border border-white/5 rounded-2xl overflow-hidden bg-black/10">
              <table className="w-full text-left border-collapse text-[11px] font-mono text-zinc-400">
                <thead>
                  <tr className="bg-zinc-900/30 border-b border-white/5 text-zinc-500 font-bold">
                    <th className="p-3">Column Name</th>
                    <th className="p-3 text-center">Type</th>
                    <th className="p-3 text-center">Completeness</th>
                    <th className="p-3 text-center">Uniqueness</th>
                    <th className="p-3 text-center">Nulls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activeDataset.profiles?.map((col) => (
                    <tr key={col.name} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-white font-semibold">{col.name}</td>
                      <td className="p-3 text-center text-primary">{col.type}</td>
                      <td className="p-3 text-center">{col.completeness.toFixed(1)}%</td>
                      <td className="p-3 text-center">{col.uniqueness.toFixed(1)}%</td>
                      <td className="p-3 text-center text-amber-400 font-bold">{col.missingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 relative z-10">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Data Cleaning Audit Trail
            </h2>
            <div className="bg-zinc-900/10 border border-white/5 p-5 rounded-2xl font-mono text-xs text-zinc-400 space-y-2">
              {activeDataset.changelog.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">{idx + 1}.</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Visual appendix — the auto dashboard, static, included in the PDF */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2 px-1">
          <BarChart3 className="w-4 h-4 text-primary" />
          Visual Appendix
        </h2>
        <AutoDashboard dataset={activeDataset} interactive={false} />
      </div>

      {/* Report footer */}
      <div className="border-t border-white/5 pt-5 pb-2 text-center">
        <p className="text-[11px] font-mono text-zinc-500">
          Generated with Nexora — local-first analytics. Data never left this machine.
        </p>
        <p className="text-[10px] font-mono text-zinc-600 mt-1">
          {new Date().toISOString().slice(0, 10)} · {activeDataset.rows.length} rows ·{" "}
          {activeDataset.columns.length} columns · health {activeDataset.health.overall}%
        </p>
      </div>
    </motion.div>
  );
}
