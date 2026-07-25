"use client";

import { useState } from "react";
import {
  History,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  ScrollText,
  Trash2,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { downloadXlsx } from "@/lib/export-xlsx";
import type { ExportRecord } from "@/lib/types";
import { motion } from "framer-motion";

const KIND_META: Record<ExportRecord["kind"], { icon: typeof FileText; mime: string }> = {
  csv: { icon: FileSpreadsheet, mime: "text/csv;charset=utf-8" },
  xlsx: { icon: FileSpreadsheet, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  md: { icon: FileText, mime: "text/markdown;charset=utf-8" },
  recipe: { icon: FileJson, mime: "application/json" },
  workspace: { icon: FileJson, mime: "application/json" },
};

function timeAgo(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function HistoryPage() {
  const mounted = useMounted();
  const exportHistory = useNexora((s) => s.exportHistory);
  const auditLog = useNexora((s) => s.auditLog);
  const datasets = useNexora((s) => s.datasets);
  const notify = useNexora((s) => s.notify);
  const clearNotifications = useNexora((s) => s.clearNotifications);

  const [tab, setTab] = useState<"exports" | "audit">("exports");

  if (!mounted) return null;

  const handleRedownload = (rec: ExportRecord) => {
    if (rec.kind === "xlsx") {
      // Binary exports are regenerated from the dataset's current state.
      const ds = datasets.find((d) => d.id === rec.datasetId);
      if (!ds) {
        notify("error", "Re-download failed", `The dataset behind '${rec.filename}' no longer exists.`);
        return;
      }
      downloadXlsx(ds);
      return;
    }
    if (!rec.content) {
      notify("error", "Re-download failed", `'${rec.filename}' was too large to keep a stored copy.`);
      return;
    }
    const blob = new Blob([rec.content], { type: KIND_META[rec.kind].mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 md:p-8 max-w-4xl mx-auto space-y-6"
    >
      <div className="flex justify-between items-end gap-4 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight mb-1 flex items-center gap-2.5">
            <History className="w-6 h-6 text-primary" />
            History &amp; Audit
          </h1>
          <p className="text-sm text-on-surface-variant">
            Every export is kept here for re-download, and every action is logged.
          </p>
        </div>
        <div className="flex bg-surface-container-low/60 rounded-xl p-1 border border-white/5 text-[12px]">
          <button
            type="button"
            onClick={() => setTab("exports")}
            className={`px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${tab === "exports" ? "bg-primary text-black" : "text-on-surface-variant hover:text-white"}`}
          >
            Exports ({exportHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("audit")}
            className={`px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${tab === "audit" ? "bg-primary text-black" : "text-on-surface-variant hover:text-white"}`}
          >
            Audit log ({auditLog.length})
          </button>
        </div>
      </div>

      {tab === "exports" ? (
        exportHistory.length === 0 ? (
          <div className="nexora-card p-12 text-center text-sm text-on-surface-variant">
            Nothing exported yet. Reports, recipes, and Excel files you export will appear here for
            re-download at any time.
          </div>
        ) : (
          <div className="space-y-2">
            {exportHistory.map((rec) => {
              const Icon = KIND_META[rec.kind].icon;
              const redownloadable = rec.kind === "xlsx"
                ? datasets.some((d) => d.id === rec.datasetId)
                : !!rec.content;
              return (
                <div key={rec.id} className="nexora-card p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{rec.filename}</p>
                    <p className="text-[11px] font-mono text-on-surface-variant">
                      {rec.kind.toUpperCase()} · {timeAgo(rec.at)}
                      {rec.datasetName && ` · ${rec.datasetName}`}
                      {rec.kind === "xlsx" && " · regenerated live"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRedownload(rec)}
                    disabled={!redownloadable}
                    title={redownloadable ? "Download again" : "No stored copy available"}
                    className="press px-3.5 py-2 rounded-lg bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer disabled:opacity-30 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Re-download
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : auditLog.length === 0 ? (
        <div className="nexora-card p-12 text-center text-sm text-on-surface-variant">
          No activity yet. Imports, fixes, queries, exports, and connection events all land here.
        </div>
      ) : (
        <div className="nexora-card overflow-hidden">
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#11182b]">
                <tr className="border-b border-white/[0.06] text-on-surface-variant">
                  <th className="p-3 font-medium text-[11px] w-24">When</th>
                  <th className="p-3 font-medium text-[11px] w-24">Action</th>
                  <th className="p-3 font-medium text-[11px]">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono text-[11.5px] text-on-surface-variant">
                {auditLog.map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.02]">
                    <td className="p-3 whitespace-nowrap">{timeAgo(e.at)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[10px] uppercase">
                        {e.action}
                      </span>
                    </td>
                    <td className="p-3 text-on-surface">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "audit" && auditLog.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => clearNotifications()}
            className="press text-[11px] text-on-surface-variant hover:text-white flex items-center gap-1.5 cursor-pointer"
            title="Clears the notification tray (the audit log itself is append-only)"
          >
            <Trash2 className="w-3 h-3" />
            Clear notification tray
          </button>
        </div>
      )}
      <p className="text-[10px] font-mono text-on-surface-variant/60 flex items-center gap-1.5">
        <ScrollText className="w-3 h-3" />
        Audit log is append-only, capped at 300 entries, stored locally in this browser.
      </p>
    </motion.div>
  );
}
