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
  Sparkles,
  Wand2,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { executeSql, type SqlResult } from "@/lib/sql-engine";
import { generateSqlFromEnglish, optimizeOrFixQuery } from "@/lib/ai";
import { WorkspaceEmpty } from "@/components/layout/workspace-empty";
import { motion } from "framer-motion";
import { PAGE_CENTERED } from "@/components/layout/page-shell";

export default function SqlLabPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const addDataset = useNexora((s) => s.addDataset);
  const settings = useNexora((s) => s.settings);
  const notify = useNexora((s) => s.notify);
  const logAudit = useNexora((s) => s.logAudit);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);

  // AI assist state
  const [english, setEnglish] = useState("");
  const [aiBusy, setAiBusy] = useState<"generate" | "advise" | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);

  // Sync editor with the active dataset: pull a prefilled query handed over from
  // the AI Analyst (sessionStorage is an external store, so this belongs in an
  // effect), otherwise seed a sensible default and clear the previous result.
  useEffect(() => {
    if (!activeDataset) return;
    const cleanName = activeDataset.name.replace(/\.[^/.]+$/, "");
    const sessionQuery = window.sessionStorage.getItem("nexora_prefilled_sql");
    if (sessionQuery) window.sessionStorage.removeItem("nexora_prefilled_sql");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(sessionQuery ?? `SELECT * FROM ${cleanName} LIMIT 10`);
    setResult(null);
  }, [activeId, activeDataset]);

  if (!mounted) {
    return (
      <div className={PAGE_CENTERED}>
        <div className="text-zinc-500 font-mono text-xs animate-pulse">
          Loading SQL Sandbox Environment...
        </div>
      </div>
    );
  }

  // 1. EMPTY STATE
  if (datasets.length === 0 || !activeDataset) {
    return (
      <WorkspaceEmpty
        icon={Database}
        title="SQL Lab"
        body="Write and run real SQL against your file, in this tab, with results in milliseconds. Choose a dataset to query."
      />
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
    setAiAdvice(null);
    // Add small visual delay
    await new Promise((resolve) => setTimeout(resolve, 150));
    const res = executeSql(query, activeDataset.rows);
    setResult(res);
    setRunning(false);
    if (res.error) {
      logAudit("query", `Query failed: ${res.error}`, activeDataset.id);
    }
  };

  const handleGenerateSql = async () => {
    if (!english.trim() || !settings.geminiApiKey) return;
    setAiBusy("generate");
    try {
      const sql = await generateSqlFromEnglish(settings.geminiApiKey, activeDataset, english.trim());
      setQuery(sql);
      setAiAdvice(null);
      logAudit("query", `AI generated SQL from: "${english.trim()}"`, activeDataset.id);
    } catch (err) {
      notify("error", "SQL generation failed", err instanceof Error ? err.message : "Request failed");
    } finally {
      setAiBusy(null);
    }
  };

  const handleAskAiAdvice = async () => {
    if (!result || !settings.geminiApiKey) return;
    setAiBusy("advise");
    try {
      const advice = await optimizeOrFixQuery(settings.geminiApiKey, activeDataset, query, {
        error: result.error,
        timeMs: result.executionTimeMs,
      });
      setAiAdvice(advice);
    } catch (err) {
      notify("error", "AI review failed", err instanceof Error ? err.message : "Request failed");
    } finally {
      setAiBusy(null);
    }
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
      // Below lg the two panes stack and the page scrolls normally; a 420px
      // pane cannot share a phone screen with anything.
      className="flex w-full flex-col select-none lg:h-full lg:flex-row lg:overflow-hidden"
    >
      {/* LEFT PANEL: Schema Explorer and Code Editor */}
      <div className="flex w-full shrink-0 flex-col space-y-6 border-b border-white/5 bg-zinc-950/20 p-5 backdrop-blur-sm sm:p-6 lg:w-[420px] lg:border-b-0 lg:border-r lg:overflow-y-auto">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight leading-tight mb-1">
            SQL Lab Sandbox
          </h2>
          <p className="text-xs text-zinc-500">
            Execute SELECT queries locally in your browser.
          </p>
        </div>

        {/* English → SQL (AI) */}
        <div className="space-y-2 shrink-0">
          <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block px-1 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" />
            Ask in English
          </label>
          <div className="flex gap-2">
            <input
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGenerateSql();
              }}
              placeholder={
                settings.geminiApiKey
                  ? `e.g. "total salary by party, highest first"`
                  : "Add a Gemini API key in Settings to enable this"
              }
              disabled={!settings.geminiApiKey || aiBusy !== null}
              className="flex-1 bg-black/30 border border-white/10 rounded-xl text-xs text-white px-3 py-2.5 focus:border-primary/50 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleGenerateSql}
              disabled={!settings.geminiApiKey || !english.trim() || aiBusy !== null}
              className="px-3.5 py-2 bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 rounded-xl text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 shrink-0"
            >
              <Wand2 className="w-3.5 h-3.5" />
              {aiBusy === "generate" ? "Writing…" : "→ SQL"}
            </button>
          </div>
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

          {/* min-h keeps the editor usable when the column has no fixed height */}
          <div className="flex-1 min-h-[220px] bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col font-mono text-xs relative group focus-within:border-primary/50 transition-colors shadow-inner lg:min-h-0">
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
              className="absolute right-3.5 bottom-3.5 px-4 py-2 bg-primary disabled:bg-zinc-900 text-black disabled:text-zinc-600 rounded-xl text-xs font-mono uppercase tracking-wider font-bold hover:bg-primary-fixed disabled:cursor-not-allowed transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {running ? "Running..." : "Run Query"}
            </button>
          </div>
        </div>

        {/* AI review of the last run */}
        {result && settings.geminiApiKey && (
          <div className="space-y-2 shrink-0">
            <button
              onClick={handleAskAiAdvice}
              disabled={aiBusy !== null}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5 border ${
                result.error
                  ? "bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20"
                  : "bg-white/5 border-white/10 text-on-surface hover:bg-white/[0.08]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {aiBusy === "advise"
                ? "Reviewing…"
                : result.error
                  ? "Ask AI to fix this error"
                  : `Ask AI to optimize (ran in ${result.executionTimeMs} ms)`}
            </button>
            {aiAdvice && (
              <div className="bg-black/40 border border-primary/20 rounded-xl p-3.5 text-[11.5px] text-on-surface leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                {aiAdvice}
              </div>
            )}
          </div>
        )}

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
                className="w-full text-left p-3.5 rounded-xl border border-white/5 bg-zinc-950/20 hover:bg-zinc-900/60 hover:border-white/15 text-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] cursor-pointer flex items-center justify-between group active:scale-[0.98]"
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
      <div className="flex min-h-[60vh] min-w-0 flex-1 flex-col bg-black/10 lg:min-h-0 lg:overflow-hidden">
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
            <div className="h-full flex flex-col justify-center items-center text-center text-on-surface-variant text-sm">
              <Terminal className="w-8 h-8 mb-3 text-zinc-700" />
              <span>Run a query to see results here.</span>
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
            <div className="nexora-card overflow-hidden">
              <div className="overflow-x-auto select-text">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-on-surface-variant">
                      {result.columns.map((c) => (
                        <th
                          key={c}
                          className="p-3.5 font-medium text-[11px]"
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
