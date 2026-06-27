"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "./sleek";

/* Adapted from 21st.dev "Testimonial-v2": vertical scrolling columns with a
   mask fade. Re-skinned to Nexora glass + periwinkle, initials instead of
   stock photos, and real analyst voices. */

type Quote = { text: string; name: string; role: string; tone: string };

const QUOTES: Quote[] = [
  {
    text: "Nexora caught a 27% null rate in a column our BI tool reported as clean. It runs entirely in the tab, which made security sign-off trivial.",
    name: "Julian Vercauteren",
    role: "Lead Analytics Architect",
    tone: "from-primary/30 to-primary/10",
  },
  {
    text: "I stopped writing throwaway Python to profile CSVs. Drop the file, read the health score, ask Axiom a question. That is the whole loop now.",
    name: "Linnea Söderberg",
    role: "Senior BI Engineer",
    tone: "from-secondary/30 to-secondary/10",
  },
  {
    text: "The SQL Lab running in-browser is genuinely fast. Joins on a 600k row export return before I finish reading my own query.",
    name: "Hassan Ali",
    role: "Data Platform Lead",
    tone: "from-tertiary/30 to-tertiary/10",
  },
  {
    text: "Axiom shows the SQL behind every answer, so I can trust it and paste it straight into our warehouse. No black box.",
    name: "Mara Okonkwo",
    role: "Head of Analytics",
    tone: "from-primary/30 to-primary/10",
  },
  {
    text: "We onboarded three analysts in an afternoon. The Dataset Doctor fix plan reads like a checklist they already understood.",
    name: "Devon Pierce",
    role: "Director of Data",
    tone: "from-secondary/30 to-secondary/10",
  },
  {
    text: "Nothing leaves the machine. For a healthcare dataset that single fact moved us from a six-week review to same-day approval.",
    name: "Priya Nair",
    role: "Clinical Data Manager",
    tone: "from-tertiary/30 to-tertiary/10",
  },
  {
    text: "The reports export looks like something our consultants would charge for. Clients think we built a custom tool.",
    name: "Tomas Reinholt",
    role: "Founder, Clearpath",
    tone: "from-primary/30 to-primary/10",
  },
  {
    text: "OCR on scanned invoices is the feature I did not know I needed. It pulls a clean table I can profile in seconds.",
    name: "Aisha Bello",
    role: "Finance Operations",
    tone: "from-secondary/30 to-secondary/10",
  },
  {
    text: "It feels like a native app, not a web tool. The motion is calm and everything responds the instant I touch it.",
    name: "Greg Whitmore",
    role: "Quant Researcher",
    tone: "from-tertiary/30 to-tertiary/10",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

function Column({ items, duration }: { items: Quote[]; duration: number }) {
  const reduced = useReducedMotion();
  return (
    <div className="overflow-hidden">
      <motion.ul
        animate={reduced ? undefined : { translateY: "-50%" }}
        transition={{ duration, repeat: Infinity, ease: "linear", repeatType: "loop" }}
        className="flex flex-col gap-4 list-none m-0 p-0"
      >
        {[...items, ...items].map((q, i) => (
          <li
            key={i}
            className="glass sheen rounded-3xl p-6 w-full select-none"
            aria-hidden={i >= items.length}
          >
            <p className="text-[14px] text-zinc-300 leading-relaxed">{q.text}</p>
            <div className="flex items-center gap-3 mt-5">
              <span
                className={`w-9 h-9 rounded-full bg-gradient-to-br ${q.tone} border border-white/10 flex items-center justify-center text-[11px] font-semibold text-white`}
              >
                {initials(q.name)}
              </span>
              <div>
                <p className="text-[13px] font-medium text-white leading-tight">{q.name}</p>
                <p className="text-[11px] text-zinc-500">{q.role}</p>
              </div>
            </div>
          </li>
        ))}
      </motion.ul>
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="px-6 py-24">
      <Reveal className="max-w-2xl mx-auto text-center mb-12">
        <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-[12px] text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Loved by analysts
        </span>
        <h2 className="mt-6 text-3xl md:text-5xl font-semibold tracking-[-0.02em] text-white">
          Trusted where the data is serious.
        </h2>
      </Reveal>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[680px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
        <Column items={QUOTES.slice(0, 3)} duration={28} />
        <Column items={QUOTES.slice(3, 6)} duration={34} />
        <div className="hidden lg:block">
          <Column items={QUOTES.slice(6, 9)} duration={31} />
        </div>
      </div>
    </section>
  );
}
