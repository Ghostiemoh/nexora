"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, ShieldCheck, TrendingUp, Search } from "lucide-react";

const BARS = [38, 60, 48, 72, 64, 88, 81];
const R = 52;
const CIRC = 2 * Math.PI * R;

/* A calm, glassy app window. The kind of mockup Apple floats under a headline.
   Health ring draws in, bars grow, Axiom answers. Restrained, one accent. */
export function AppWindow() {
  const reduced = useReducedMotion();

  return (
    <div className="glass sheen float-soft rounded-[26px] overflow-hidden">
      {/* title bar */}
      <div className="h-12 flex items-center gap-4 px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]/90" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]/90" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]/90" />
        </div>
        <div className="flex-1 flex items-center gap-2 h-7 px-3 rounded-lg bg-black/30 border border-white/[0.05] text-zinc-500 max-w-xs">
          <Search className="w-3.5 h-3.5" />
          <span className="text-[11px] font-mono">q3_revenue.csv</span>
        </div>
        <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          local
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* sidebar */}
        <div className="hidden md:flex md:col-span-3 flex-col gap-1 p-3 border-r border-white/[0.06]">
          {["Overview", "Doctor", "Axiom", "SQL Lab", "Reports"].map((item, i) => (
            <div
              key={item}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] ${
                i === 0 ? "bg-primary/15 text-white" : "text-zinc-500"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-primary" : "bg-zinc-700"}`} />
              {item}
            </div>
          ))}
        </div>

        {/* main */}
        <div className="md:col-span-9 p-5 md:p-6 space-y-4">
          <div className="grid grid-cols-12 gap-4">
            {/* health ring */}
            <div className="col-span-12 sm:col-span-5 rounded-2xl border border-white/[0.06] bg-black/20 p-5 flex items-center gap-4">
              <div className="relative w-[120px] h-[120px] shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r={R} stroke="#1b2238" strokeWidth="9" fill="none" />
                  <motion.circle
                    cx="60"
                    cy="60"
                    r={R}
                    stroke="var(--primary)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={CIRC}
                    initial={reduced ? false : { strokeDashoffset: CIRC }}
                    whileInView={{ strokeDashoffset: CIRC - 0.98 * CIRC }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold text-white tabular-nums">98</span>
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500">health</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5" /> 0 leaks
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  3 fixes applied. Schema typed, deduped, validated.
                </p>
              </div>
            </div>

            {/* revenue bars */}
            <div className="col-span-12 sm:col-span-7 rounded-2xl border border-white/[0.06] bg-black/20 p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-white">Monthly revenue</span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <TrendingUp className="w-3.5 h-3.5" /> +24.8%
                </span>
              </div>
              <div className="flex items-end gap-2 h-[88px]">
                {BARS.map((h, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-md bg-gradient-to-t from-primary/25 to-primary"
                    style={{ transformOrigin: "bottom" }}
                    initial={reduced ? false : { scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <div style={{ height: `${h}%` }} />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Axiom answer */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.9, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-primary">Axiom</span>
              <p className="text-[13px] text-zinc-300 leading-relaxed">
                423 Enterprise accounts cut API usage over 40% this month. Accounts that fall this
                fast tend to churn within 30 days.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
