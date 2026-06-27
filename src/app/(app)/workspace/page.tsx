"use client";

import { useState, useEffect, useRef } from "react";
import {
  Table as TableIcon,
  BarChart3,
  Send,
  Trash2,
  Database,
  Grid,
  Sparkles,
  FileSpreadsheet,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Activity,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { UploadDropzone } from "@/components/upload-dropzone";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function WorkspacePage() {
  const mounted = useMounted();
  const router = useRouter();

  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const chatHistory = useNexora((s) => s.chatHistory);
  const addChatMessage = useNexora((s) => s.addChatMessage);
  const clearChat = useNexora((s) => s.clearChat);

  const activeDataset = datasets.find((d) => d.id === activeId) || null;

  // Tabs: "table" | "chart"
  const [activeTab, setActiveTab] = useState<"table" | "chart">("table");

  // Grid/Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Chart State
  const [selectedColumn, setSelectedColumn] = useState("");
  const [prevActiveId, setPrevActiveId] = useState(activeId);

  // Sync active dataset default column in render
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId);
    if (activeDataset && activeDataset.profiles) {
      const firstCat = activeDataset.profiles.find((p) => p.topValues && p.topValues.length > 0);
      if (firstCat) {
        setSelectedColumn(firstCat.name);
      } else if (activeDataset.columns.length > 0) {
        setSelectedColumn(activeDataset.columns[0]);
      }
    }
  }

  if (!selectedColumn && activeDataset && activeDataset.profiles) {
    const firstCat = activeDataset.profiles.find((p) => p.topValues && p.topValues.length > 0);
    if (firstCat) {
      setSelectedColumn(firstCat.name);
    } else if (activeDataset.columns.length > 0) {
      setSelectedColumn(activeDataset.columns[0]);
    }
  }

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, activeId]);

  if (!mounted) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-500 font-mono text-xs">
          Loading Workspace Environment...
        </div>
      </div>
    );
  }

  // 1. EMPTY STATE
  if (datasets.length === 0 || !activeDataset) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto min-h-[80vh] flex flex-col justify-center items-center">
        <div className="max-w-xl w-full text-center space-y-6">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Grid className="w-6 h-6 text-primary animate-spin-slow" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white font-headline-md">
              Data Explorer Workspace
            </h2>
            <p className="text-sm text-on-surface-variant max-w-sm mx-auto">
              Ingest a data source to enable grid filtering, categorical plotting, and conversational database queries.
            </p>
          </div>

          <div className="nexora-card p-6 border-dashed border-outline-variant/60 bg-surface-container-low/30">
            <UploadDropzone />
          </div>
        </div>
      </div>
    );
  }

  // Filter rows based on search
  const filteredRows = activeDataset.rows.filter((row) =>
    Object.values(row).some((val) =>
      String(val ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + rowsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleSendChat = (text: string) => {
    if (!text.trim()) return;
    addChatMessage(activeDataset.id, text.trim());
    setChatInput("");
  };

  const handleRunSQLInLab = (sqlQuery: string) => {
    window.sessionStorage.setItem("nexora_prefilled_sql", sqlQuery);
    router.push("/sql-lab");
  };

  const currentChat = chatHistory[activeDataset.id] || [];

  // Get chart topValues
  const currentProfile = activeDataset.profiles?.find((p) => p.name === selectedColumn);
  const chartData = currentProfile?.topValues || [];

  // Circle Gauge Metrics
  const healthScore = activeDataset.health?.overall || 85;

  // Stagger list variants for table rows
  const rowContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.015,
      },
    },
  } as const;

  const rowItemVariants = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 350, damping: 25 } },
  } as const;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-black select-none">
      
      {/* LEFT: Data Exploration Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[radial-gradient(ellipse_at_top_left,rgba(24,28,41,0.5),transparent_60%)] p-6 space-y-6 overflow-hidden">
        
        {/* TOP BENTO BAR: High-density Metadata Widget */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-surface-container-low/40 border border-white/5 backdrop-blur-md rounded-xl p-4 shadow-xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">Active Dataset</span>
              <span className="block text-body-md font-bold text-white truncate font-sans">{activeDataset.name}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 border-l border-white/5 pl-4">
            <div className="w-9 h-9 rounded-lg bg-zinc-800/50 border border-white/5 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-bold">Inferred Schema</span>
              <span className="block text-body-md font-mono text-white font-bold">
                {activeDataset.columns.length} <span className="text-zinc-600 font-sans text-xs">cols</span> × {activeDataset.rows.length} <span className="text-zinc-600 font-sans text-xs">rows</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 border-l border-white/5 pl-4">
            <div className="w-9 h-9 rounded-lg bg-tertiary/10 border border-tertiary/20 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-tertiary" />
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-bold">Diagnostics</span>
              <span className="block text-body-md font-mono text-tertiary font-bold">
                {activeDataset.diagnostics.length} <span className="text-zinc-600 font-sans text-xs font-normal">flags</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 border-l border-white/5 pl-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-bold">Health Score</span>
              <span className="block text-body-md font-mono text-emerald-400 font-bold">{healthScore}%</span>
            </div>
          </div>
        </div>

        {/* Tab Selection & Search Control Bar */}
        <div className="flex justify-between items-center shrink-0">
          {/* Apple style sliding highlight switcher */}
          <div className="flex bg-surface-container-low/60 rounded-xl p-1 border border-white/5 backdrop-blur-sm shadow-[inset_0_1px_rgba(255,255,255,0.03)] relative overflow-hidden">
            <button
              onClick={() => setActiveTab("table")}
              className={`relative z-10 flex items-center gap-2 px-4 py-2 rounded-lg text-body-md font-semibold transition-all duration-200 cursor-pointer active:scale-95 ${
                activeTab === "table" ? "text-black" : "text-on-surface-variant hover:text-white"
              }`}
            >
              <TableIcon className="w-4 h-4" />
              Data Table View
              {activeTab === "table" && (
                <motion.div
                  layoutId="active-workspace-tab-pill"
                  className="absolute inset-0 bg-primary rounded-lg border border-primary/20 -z-10 shadow-lg shadow-primary/10"
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab("chart")}
              className={`relative z-10 flex items-center gap-2 px-4 py-2 rounded-lg text-body-md font-semibold transition-all duration-200 cursor-pointer active:scale-95 ${
                activeTab === "chart" ? "text-black" : "text-on-surface-variant hover:text-white"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Category Chart View
              {activeTab === "chart" && (
                <motion.div
                  layoutId="active-workspace-tab-pill"
                  className="absolute inset-0 bg-primary rounded-lg border border-primary/20 -z-10 shadow-lg shadow-primary/10"
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                />
              )}
            </button>
          </div>

          {activeTab === "table" && (
            <div className="relative w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-surface-container-low/60 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-zinc-500 text-body-md focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all shadow-inner"
                placeholder="Search raw rows..."
              />
            </div>
          )}
        </div>

        {/* Core Container: Data Grid or Category Chart */}
        <div className="flex-1 min-h-0 bg-surface-container-low/40 border border-white/5 backdrop-blur-md rounded-2xl overflow-hidden flex flex-col relative shadow-2xl">
          <AnimatePresence mode="wait">
            {activeTab === "table" ? (
              /* DATA GRID - SLIDING CONTAINER */
              <motion.div
                key="table-tab"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse text-body-md">
                    <thead>
                      <tr className="border-b border-white/5 bg-surface-container-low/80 backdrop-blur-md sticky top-0 z-10">
                        {activeDataset.columns.map((col) => (
                          <th
                            key={col}
                            className="p-4 text-zinc-500 font-bold font-mono text-[10px] uppercase tracking-wider border-r border-white/5"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <motion.tbody
                      key={currentPage + searchQuery}
                      variants={rowContainerVariants}
                      initial="hidden"
                      animate="show"
                      className="divide-y divide-white/5 font-mono text-[12px] text-zinc-300"
                    >
                      {paginatedRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={activeDataset.columns.length}
                            className="p-8 text-center text-zinc-500 font-sans"
                          >
                            No matching records found.
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row, rIdx) => (
                          <motion.tr
                            key={rIdx}
                            variants={rowItemVariants}
                            className="hover:bg-white/[0.03] transition-colors group"
                          >
                            {activeDataset.columns.map((col) => (
                              <td key={col} className="p-3.5 truncate max-w-[180px] border-r border-white/5 group-hover:text-white transition-colors">
                                {row[col] === null || row[col] === undefined ? (
                                  <span className="inline-flex items-center gap-1.5 text-tertiary">
                                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                                    null
                                  </span>
                                ) : (
                                  String(row[col])
                                )}
                              </td>
                            ))}
                          </motion.tr>
                        ))
                      )}
                    </motion.tbody>
                  </table>
                </div>

                {/* PAGINATION FOOTER */}
                <div className="px-6 py-4 border-t border-white/5 bg-surface-container-low/60 flex justify-between items-center shrink-0 backdrop-blur-md">
                  <span className="text-[12px] text-zinc-500 font-mono">
                    Showing {startIndex + 1} - {Math.min(startIndex + rowsPerPage, filteredRows.length)} of{" "}
                    <span className="text-white font-bold">{filteredRows.length}</span> rows
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      aria-label="Previous data page"
                      className="p-1.5 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-white hover:border-primary/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-90"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-body-md font-mono text-zinc-300 px-2">
                      Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      aria-label="Next data page"
                      className="p-1.5 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-white hover:border-primary/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-90"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* CHART VIEW - SLIDING CONTAINER */
              <motion.div
                key="chart-tab"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="flex-1 p-6 flex flex-col space-y-6 overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div>
                    <h4 className="font-headline-md text-[16px] font-semibold text-white">
                      Categorical Distributions
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Visualize top occurrences for text columns.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-900/40 border border-white/5 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Column:</span>
                    <select
                      value={selectedColumn}
                      onChange={(e) => setSelectedColumn(e.target.value)}
                      className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer"
                    >
                      {activeDataset.columns.map((col) => (
                        <option key={col} value={col} className="bg-black text-white">
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {chartData.length === 0 ? (
                  <div className="flex-1 flex flex-col justify-center items-center text-center">
                    <BarChart3 className="w-10 h-10 text-zinc-600 mb-2" />
                    <span className="text-body-md text-zinc-500">No top values available for this column.</span>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full space-y-4">
                    {chartData.map((item, idx) => {
                      const maxVal = Math.max(...chartData.map((d) => d.count)) || 1;
                      const percent = Math.round((item.count / maxVal) * 100);
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-white font-semibold">{item.value || "(blank)"}</span>
                            <span className="text-primary font-bold">{item.count} occurrences</span>
                          </div>
                          <div className="w-full bg-zinc-900/60 h-8 rounded-lg overflow-hidden relative border border-white/5">
                            <motion.div
                              className="h-full bg-gradient-to-r from-primary/10 to-primary/25 border-r-2 border-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              transition={{ type: "spring", stiffness: 80, damping: 15 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* RIGHT: Conversational AI Analyst */}
      <div className="w-[420px] flex flex-col border-l border-white/5 bg-[linear-gradient(to_bottom,rgba(13,17,29,0.7),rgba(6,9,17,0.8))] shrink-0 overflow-hidden relative">
        
        {/* Chat Header */}
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_10px_rgba(192,193,255,0.15)]">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-headline-md text-[13px] font-bold text-white uppercase tracking-wider">
              Axiom NLP Analyst
            </h3>
          </div>
          <button
            onClick={() => clearChat(activeDataset.id)}
            className="p-1.5 rounded-lg border border-white/5 text-zinc-500 hover:text-error hover:border-error/20 transition-all cursor-pointer active:scale-90"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Chat History Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AnimatePresence initial={false}>
            {currentChat.map((msg) => {
              if (msg.role === "system") {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="text-center my-2"
                  >
                    <span className="inline-block px-3 py-1 bg-zinc-900/60 rounded-full text-[10px] font-mono text-zinc-500 border border-white/5">
                      {msg.text}
                    </span>
                  </motion.div>
                );
              }

              const isUser = msg.role === "user";
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 15, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1.5`}
                >
                  {/* Text Bubble */}
                  <div
                    className={`max-w-[90%] rounded-2xl p-4 text-body-md leading-relaxed shadow-lg ${
                      isUser
                        ? "bg-primary/10 border border-primary/20 text-primary shadow-[inset_0_1px_rgba(255,255,255,0.05)] rounded-tr-sm"
                        : "bg-surface-container-low/80 border border-white/5 text-zinc-100 rounded-tl-sm backdrop-blur-md"
                    }`}
                  >
                    {/* Highlight SQL or code terms */}
                    {!isUser && msg.text.includes("SELECT") ? (
                      <div className="space-y-3">
                        <p>{msg.text.split("```")[0]}</p>
                        <div className="bg-black/60 border border-white/5 rounded-xl p-3.5 font-mono text-[11px] text-emerald-400 overflow-x-auto relative group shadow-inner">
                          <pre>{msg.text.match(/SELECT[\s\S]*?(?=;|\b|$)/)?.[0] || msg.text}</pre>
                          <button
                            onClick={() =>
                              handleRunSQLInLab(
                                msg.text.match(/SELECT[\s\S]*?(?=;|\b|$)/)?.[0] || msg.text
                              )
                            }
                            className="absolute right-2 top-2 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-black font-sans text-[10px] font-bold cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 duration-100"
                          >
                            Run SQL
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-line">{msg.text}</p>
                    )}

                    {/* Render Table from Axiom Response */}
                    {!isUser && msg.table && (
                      <div className="mt-3 border border-white/5 rounded-xl overflow-hidden bg-black/40 text-[11px] font-mono text-zinc-300 shadow-inner">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-zinc-900/40 border-b border-white/5">
                              {msg.table.headers.map((h) => (
                                <th key={h} className="p-2.5 font-bold text-zinc-500 text-[10px] uppercase tracking-wider">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {msg.table.rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                {msg.table!.headers.map((h, colIdx) => (
                                  <td key={colIdx} className="p-2.5 truncate max-w-[120px]">
                                    {row[colIdx] === null || row[colIdx] === undefined ? (
                                      <span className="text-tertiary font-bold">null</span>
                                    ) : (
                                      String(row[colIdx])
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Suggestions Chips */}
                  {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1 select-none">
                      {msg.suggestions.map((chip, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendChat(chip)}
                          className="px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-900 border border-white/5 hover:border-primary/30 text-[11px] text-primary rounded-full transition-all cursor-pointer text-left shadow-sm active:scale-95 hover:-translate-y-[1px]"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Bar */}
        <div className="p-4 border-t border-white/5 bg-zinc-950/80 backdrop-blur-md shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat(chatInput);
            }}
            className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 rounded-xl p-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/25 transition-all shadow-inner"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-transparent px-3 py-2 text-white placeholder:text-zinc-500 text-body-md focus:outline-none"
              placeholder="Query dataset using NLP..."
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              aria-label="Send message to NLP analyst"
              className="p-2 bg-primary disabled:bg-zinc-800 text-on-primary disabled:text-zinc-500 rounded-lg transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
