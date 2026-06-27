"use client";

import { useState, useEffect } from "react";
import {
  Database,
  Play,
  Clock,
  Terminal,
  Grid,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { executeSql, type SqlResult } from "@/lib/sql-engine";
import { UploadDropzone } from "@/components/upload-dropzone";
import { motion } from "framer-motion";

export default function SqlLabPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const addDataset = useNexora((s) => s.addDataset);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);

  // Load prefilled query from session storage if redirected from AI Analyst Chat
  useEffect(() => {
    if (activeDataset) {
      const cleanName = activeDataset.name.replace(/\.[^/.]+$/, "");
      const sessionQuery = window.sessionStorage.getItem("nexora_prefilled_sql");
      if (sessionQuery) {
        setQuery(sessionQuery);
        window.sessionStorage.removeItem("nexora_prefilled_sql");
      } else {
        setQuery(`SELECT * FROM ${cleanName} LIMIT 10`);
      }
      setResult(null);
    }
  }, [activeId, activeDataset]);

  if (!mounted) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-500 font-mono text-xs animate-pulse">
          Loading SQL Sandbox Environment...
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
              <Database className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white font-headline-md">
              SQL Lab Sandbox
            </h2>
            <p className="text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              Ingest a data source first to write and execute client-side relational SQL statements.
            </p>
          </div>

          <div className="bg-zinc-950/40 border border-dashed border-white/10 hover:border-primary/40 rounded-2xl p-6 transition-all duration-300">
            <UploadDropzone />
          </div>
        </div>
      </motion.div>
    );
  }

  const cleanName = activeDataset.name.replace(/\.[^/.]+$/, "");

  const sqlTemplates = [
    {
      title: "Fetch Top 10 Records",
      code: `SELECT * FROM ${cleanName} LIMIT 10`,
    },
    {
      title: "Count Total Records",
      code: `SELECT COUNT(*) AS total_rows FROM ${cleanName}`,
    },
    ...(activeDataset.profiles && activeDataset.profiles.length > 0
      ? [
          {
            title: `Group by ${activeDataset.profiles[0].name}`,
            code: `SELECT ${activeDataset.profiles[0].name}, COUNT(*) AS count FROM ${cleanName} GROUP BY ${activeDataset.profiles[0].name} ORDER BY count DESC`,
          },
        ]
      : []),
  ];

  const handleExecuteQuery = async () => {
    if (!query.trim()) return;
    setRunning(true);
    // Add small visual delay
    await new Promise((resolve) => setTimeout(resolve, 150));
    const res = executeSql(query, activeDataset.rows);
    setResult(res);
    setRunning(false);
  };

  const handleIngestResult = () => {
    if (!result || result.rows.length === 0 || result.error) return;
    const name = `query_result_${Date.now().toString(36).slice(-4)}`;
    addDataset(name, result.columns, result.rows);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-[calc(100vh-64px)] select-none w-full"
    >
      {/* LEFT PANEL: Schema Explorer and Code Editor */}
      <div className="w-[420px] flex flex-col border-r border-white/5 bg-zinc-950/20 shrink-0 p-6 space-y-6 overflow-y-auto backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight leading-tight mb-1">
            SQL Lab Sandbox
          </h2>
          <p className="text-xs text-zinc-500">
            Execute SELECT queries locally in your browser.
          </p>
        </div>

        {/* Editor Area */}
        <div className="space-y-2 flex flex-col flex-1 min-h-[220px]">
          <div className="flex justify-between items-center px-1 shrink-0">
            <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block">
              SQL Input Editor
            </label>
            <div className="flex items-center gap-1.5 text-zinc-600 font-mono text-[10px] uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5" />
              <span>sqlite-mode</span>
            </div>
          </div>
          
          <div className="flex-1 min-h-0 bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col font-mono text-xs relative group focus-within:border-primary/50 transition-colors shadow-inner">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-emerald-400 placeholder:text-zinc-700 focus:outline-none resize-none leading-relaxed h-full w-full"
              spellCheck="false"
              placeholder="SELECT * FROM table LIMIT 10..."
            />
            <button
              onClick={handleExecuteQuery}
              disabled={running || !query.trim()}
              className="absolute right-3.5 bottom-3.5 px-4 py-2 bg-primary disabled:bg-zinc-900 text-black disabled:text-zinc-600 rounded-xl text-xs font-mono uppercase tracking-wider font-bold hover:bg-primary-fixed disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {running ? "Running..." : "Run Query"}
            </button>
          </div>
        </div>

        {/* Templates Area */}
        <div className="space-y-2.5 shrink-0">
          <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block px-1">
            Query Inspiration Templates
          </label>
          <div className="space-y-2">
            {sqlTemplates.map((item, idx) => (
              <button
                key={idx}
                onClick={() => setQuery(item.code)}
                className="w-full text-left p-3.5 rounded-xl border border-white/5 bg-zinc-950/20 hover:bg-zinc-900/60 hover:border-white/15 text-xs transition-all cursor-pointer flex items-center justify-between group active:scale-[0.98]"
              >
                <div className="space-y-1 min-w-0 pr-4">
                  <span className="font-bold text-white block group-hover:text-primary transition-colors truncate">
                    {item.title}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500 truncate block">
                    {item.code}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>
        </div>

        {/* Active Schema Fields */}
        <div className="space-y-2.5 shrink-0">
          <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block px-1">
            Active Schema: {cleanName}
          </label>
          <div className="bg-zinc-950/30 border border-white/5 rounded-2xl divide-y divide-white/5 font-mono text-[11px] max-h-48 overflow-y-auto shadow-inner">
            {activeDataset.profiles?.map((p) => (
              <div key={p.name} className="flex justify-between items-center p-3">
                <span className="text-white font-semibold truncate pr-3">{p.name}</span>
                <span className="text-primary shrink-0">{p.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Query Output Results Table */}
      <div className="flex-1 flex flex-col bg-black/10 overflow-hidden">
        {/* Output Header Status */}
        <div className="px-6 py-4 border-b border-white/5 bg-zinc-900/30 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <Grid className="w-4 h-4 text-primary" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-500">
              Query Output Console
            </h3>
          </div>
          {result && !result.error && (
            <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{result.executionTimeMs} ms</span>
              </div>
              <span>•</span>
              <span>{result.rows.length} rows returned</span>
              <button
                onClick={handleIngestResult}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black font-sans text-xs font-bold cursor-pointer transition-colors active:scale-[0.98]"
              >
                Save as Table
              </button>
            </div>
          )}
        </div>

        {/* Console Container */}
        <div className="flex-1 overflow-auto p-6">
          {!result ? (
            <div className="h-full flex flex-col justify-center items-center text-center text-zinc-500 font-mono text-xs uppercase tracking-wider">
              <Terminal className="w-8 h-8 mb-3 text-zinc-700 animate-pulse" />
              <span>Editor ready. Execute statements to preview results here.</span>
            </div>
          ) : result.error ? (
            /* ERROR MESSAGE */
            <div className="p-5 bg-error-container/10 border border-error/20 text-error rounded-2xl flex gap-3 max-w-2xl backdrop-blur-sm shadow-xl">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-sm block">SQL Execution Error</span>
                <span className="font-mono text-xs leading-relaxed">{result.error}</span>
              </div>
            </div>
          ) : (
            /* DATA TABLE RESULT */
            <div className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-zinc-900/30 text-zinc-500 font-bold">
                      {result.columns.map((c) => (
                        <th
                          key={c}
                          className="p-4 font-mono uppercase tracking-wider text-[10px]"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[12px] text-zinc-400">
                    {result.rows.length === 0 ? (
                      <tr>
                        <td colSpan={result.columns.length} className="p-6 text-center text-zinc-500 uppercase tracking-wider font-mono">
                          Empty result set returned.
                        </td>
                      </tr>
                    ) : (
                      result.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                          {result.columns.map((c) => (
                            <td key={c} className="p-3.5 truncate max-w-[180px] border-r border-white/5">
                              {row[c] === null || row[c] === undefined ? (
                                <span className="text-zinc-600 italic">null</span>
                              ) : (
                                String(row[c])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
