"use client";

import React, { useState } from "react";
import { 
  HelpCircle, 
  MessageSquare, 
  Send, 
  History, 
  Search, 
  Check, 
  ExternalLink, 
  RefreshCw
} from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { motion } from "framer-motion";

export default function SupportPage() {
  const mounted = useMounted();

  // Search FAQ
  const [searchQuery, setSearchQuery] = useState("");

  // Ticket Form
  const [ticket, setTicket] = useState({
    category: "pipeline",
    title: "",
    description: "",
    severity: "low"
  });

  const [formState, setFormState] = useState<"idle" | "loading" | "success">("idle");

  // Mock Tickets list
  const [tickets, setTickets] = useState([
    {
      id: "TK-9402",
      title: "SQL parser failure on OUTER JOIN aggregation",
      category: "SQL Sandbox",
      severity: "high",
      status: "Investigating",
      date: "2026-06-12"
    },
    {
      id: "TK-8192",
      title: "RAM cache overflow on large 120MB CSV drops",
      category: "Cache Engine",
      severity: "medium",
      status: "Resolved",
      date: "2026-06-10"
    }
  ]);

  const faqs = [
    {
      q: "How does the local client-side SQL parser work?",
      a: "Nexora uses an in-memory SQL parsing engine that transpiles standard ANSI-SQL queries directly into JavaScript filter, map, and reduce functions, enabling sub-millisecond execution speeds locally in the browser."
    },
    {
      q: "What are the CSV limits for client-side profiling?",
      a: "Standard browsers can profile files up to 100MB-150MB smoothly. For larger files, Nexora automatically truncates the rows list to the first 50,000 index values for schema rendering, keeping the rest in temporary RAM buffers."
    },
    {
      q: "How is my dataset stored or secured?",
      a: "Nexora runs local-first. Datasets, raw rows, and AI analyst conversations are stored in your browser's secure sandboxed localStorage and RAM. No analytical data is uploaded to outside servers."
    }
  ];

  if (!mounted) return null;

  const filteredFaqs = faqs.filter(
    (f) =>
      f.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.a.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket.title || !ticket.description) return;

    setFormState("loading");
    setTimeout(() => {
      setFormState("success");
      
      const newTk = {
        id: `TK-${Math.floor(1000 + Math.random() * 9000)}`,
        title: ticket.title,
        category: ticket.category === "pipeline" ? "Data Pipeline" : ticket.category === "ocr" ? "OCR Laser Scanning" : "General Query",
        severity: ticket.severity,
        status: "Open",
        date: new Date().toISOString().split("T")[0]
      };

      setTickets([newTk, ...tickets]);
      setTicket({ category: "pipeline", title: "", description: "", severity: "low" });

      setTimeout(() => setFormState("idle"), 2500);
    }, 1500);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="p-8 max-w-5xl mx-auto space-y-8 select-none"
    >
      {/* Title */}
      <div className="border-b border-white/5 pb-6">
        <h2 className="text-3xl font-bold text-white tracking-tight leading-tight mb-1">
          Support Desk
        </h2>
        <p className="text-sm text-on-surface-variant">
          Search the core knowledge base or submit technical tickets directly to the engine architects.
        </p>
      </div>

      {/* Grid of Search + Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Knowledge Base & FAQs */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search knowledge base articles..."
              className="w-full bg-zinc-900/60 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-white text-xs font-mono focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all placeholder:text-zinc-600 shadow-inner"
            />
          </div>

          {/* FAQ List */}
          <div className="space-y-4">
            <h3 className="text-zinc-500 font-mono text-[10px] font-bold uppercase tracking-wider px-1">
              Frequently Answered Questions
            </h3>
            {filteredFaqs.length > 0 ? (
              <div className="space-y-3">
                {filteredFaqs.map((faq) => (
                  <div key={faq.q} className="nexora-card p-5 space-y-2 backdrop-blur-md shadow-xl">
                    <h4 className="font-bold text-white text-sm flex items-start gap-2">
                      <HelpCircle className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
                      {faq.q}
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed pl-6.5">
                      {faq.a}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="nexora-card p-6 text-center text-zinc-500 text-xs font-mono uppercase tracking-wider">
                No matching articles found. Try another query.
              </div>
            )}
          </div>

          {/* Core Docs links */}
          <div className="nexora-card p-4 flex items-center justify-between backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-[inset_0_1px_rgba(255,255,255,0.05)] shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-white block tracking-tight">Nexora Documentation Portal</span>
                <span className="text-xs text-zinc-500">Access detailed API guides and offline SDK reference sheets.</span>
              </div>
            </div>
            <a href="#" className="p-2.5 hover:bg-white/5 border border-transparent hover:border-white/5 rounded-xl text-primary transition-all cursor-pointer active:scale-95">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

        </div>

        {/* Ticket Submission Form */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Form Card */}
          <div className="nexora-card p-6 space-y-4 backdrop-blur-md shadow-xl">
            <h3 className="text-zinc-500 font-mono text-[10px] font-bold uppercase tracking-wider border-b border-white/5 pb-3">
              Open Support Ticket
            </h3>

            <form onSubmit={handleSubmitTicket} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                  Category
                </label>
                <select
                  value={ticket.category}
                  onChange={(e) => setTicket({ ...ticket, category: e.target.value })}
                  className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono cursor-pointer shadow-inner"
                >
                  <option value="pipeline">Data Pipeline</option>
                  <option value="ocr">OCR Scan</option>
                  <option value="sql">SQL Sandbox</option>
                  <option value="general">General Query</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                  Ticket Summary
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Joiner crashes on full join"
                  value={ticket.title}
                  onChange={(e) => setTicket({ ...ticket, title: e.target.value })}
                  className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono shadow-inner"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                  Detailed Details
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe the anomalies or steps to reproduce the crash..."
                  value={ticket.description}
                  onChange={(e) => setTicket({ ...ticket, description: e.target.value })}
                  className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono resize-none shadow-inner"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                  Severity Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["low", "medium", "high"].map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setTicket({ ...ticket, severity: sev })}
                      className={`py-2 rounded-xl border text-[9px] font-mono uppercase tracking-wider font-bold cursor-pointer transition-all ${
                        ticket.severity === sev
                          ? sev === "high"
                            ? "bg-error-container/20 border-error text-error"
                            : "bg-primary-container/20 border-primary text-primary"
                          : "bg-zinc-900/60 border-white/5 text-zinc-500 hover:border-white/10 hover:text-white"
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={formState === "loading" || !ticket.title || !ticket.description}
                className="w-full py-2.5 bg-primary text-black font-mono text-xs uppercase tracking-wider font-bold hover:bg-primary/95 rounded-xl transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              >
                {formState === "loading" ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Dispatching...
                  </>
                ) : formState === "success" ? (
                  <>
                    <Check className="w-4 h-4" />
                    Ticket Filed!
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    File Ticket
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Active / Past Tickets */}
          <div className="space-y-3">
            <h3 className="text-zinc-500 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-1">
              <History className="w-4 h-4" />
              Ticket Ledger
            </h3>
            <div className="space-y-2">
              {tickets.map((t) => (
                <div key={t.id} className="nexora-card p-4 flex flex-col gap-2 relative group hover:border-white/10 transition-all shadow-md">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-mono text-zinc-500 font-bold">
                      {t.id}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${
                      t.status === "Resolved"
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                  <h4 className="text-[12px] font-bold text-white leading-snug line-clamp-1">
                    {t.title}
                  </h4>
                  <div className="flex justify-between items-center text-[9px] text-zinc-500 font-mono pt-2 border-t border-white/5 uppercase tracking-wider">
                    <span>{t.category}</span>
                    <span>{t.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </motion.div>
  );
}
