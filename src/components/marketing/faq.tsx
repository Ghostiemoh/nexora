"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { Reveal } from "./sleek";

const FAQS = [
  {
    q: "Does my data ever leave my machine?",
    a: "No. Parsing, profiling, cleaning, SQL, and Axiom all run in your browser tab. Nothing is uploaded to a server, which is why there is no account required to start.",
  },
  {
    q: "How large a file can it handle?",
    a: "The free tier parses files up to 50MB and caps at 50,000 rows. Pro lifts both limits and runs in a higher-memory mode for multi-million row exports.",
  },
  {
    q: "Do I need to know SQL?",
    a: "No. Axiom turns plain-language questions into SQL, runs it, and shows you the query it wrote. If you do know SQL, the SQL Lab gives you a real in-memory engine.",
  },
  {
    q: "Will it change my data without asking?",
    a: "Never silently. The Dataset Doctor names each defect and proposes a fix plan you approve. Every applied change is recorded in an audit trail you can review.",
  },
  {
    q: "Can my team share datasets and reports?",
    a: "On the Team plan, yes: shared directories, roles, a team-wide audit log, plus direct connections to PostgreSQL and MySQL replicas.",
  },
];

function Item({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Reveal delay={index * 0.05}>
      <div className="glass rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          aria-expanded={open}
          className="press w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
        >
          <span className="text-[15px] font-medium text-white">{q}</span>
          <motion.span
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="shrink-0 text-primary"
          >
            <Plus className="w-4 h-4" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <p className="px-5 pb-5 text-[14px] text-on-surface-variant leading-relaxed">{a}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  );
}

export function Faq() {
  return (
    <section className="px-6 py-24">
      <Reveal className="max-w-2xl mx-auto text-center mb-12">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-[-0.02em] text-white">
          Questions, answered.
        </h2>
      </Reveal>
      <div className="max-w-2xl mx-auto space-y-3">
        {FAQS.map((f, i) => (
          <Item key={f.q} q={f.q} a={f.a} index={i} />
        ))}
      </div>
    </section>
  );
}
