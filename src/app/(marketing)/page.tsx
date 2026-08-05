"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileBarChart,
  LayoutDashboard,
  Stethoscope,
} from "lucide-react";
import {
  Reveal,
  HeroLift,
  Magnetic,
  Counter,
  stagger,
  staggerItem,
} from "@/components/marketing/sleek";
import { AppWindow } from "@/components/marketing/app-window";
import { Aurora } from "@/components/marketing/aurora";
import { Integrations } from "@/components/marketing/integrations";
import { Toolkit } from "@/components/marketing/toolkit";
import { Faq } from "@/components/marketing/faq";

/* ════════════════════════════════════════════════
   NEXORA — landing "sleek" · Apple / iOS grade
   Airy, frosted glass, soft depth, spring motion,
   one periwinkle accent. Calm over loud.

   House rule for this page: every number and claim
   below is checkable in the source. No usage stats
   we cannot measure, no customers we do not have.
   ════════════════════════════════════════════════ */

/** Product limits and capabilities, all verifiable in the code:
 *  ROW_CAP and MAX_FILE_BYTES in lib/csv.ts, CHART_TYPES in
 *  lib/chart-recommend.ts, and the fact that there is no upload endpoint. */
const FACTS = [
  { to: 50_000, label: "Rows per file, parsed in the tab" },
  { to: 25, suffix: " MB", label: "Maximum file size" },
  { to: 8, label: "Chart types, switchable per chart" },
  { to: 0, suffix: " bytes", label: "Sent to any server" },
];

const WORKFLOW = [
  {
    step: "01",
    icon: Stethoscope,
    title: "Dataset Doctor",
    body: "The file lands and is profiled on the spot: types, ranges, gaps, duplicates, outliers, encodings. Each defect comes with the fix that repairs it, and every fix is undoable.",
    href: "/dataset-doctor",
  },
  {
    step: "02",
    icon: LayoutDashboard,
    title: "Dashboard",
    body: "Nexora reads what your columns mean, not just what type they are, and builds the KPIs the data supports. Revenue, margin, order value, growth. Nothing irrelevant, nothing invented.",
    href: "/dashboard",
  },
  {
    step: "03",
    icon: FileBarChart,
    title: "Reports",
    body: "The findings become a written analysis with a summary, evidence, root causes, and recommendations. Edit any section, then export to PDF, Word, or Markdown.",
    href: "/reports",
  },
];

const FREE_FEATURES = [
  "Dataset Doctor with one-click fixes",
  "Auto-built dashboard with adaptive KPIs",
  "In-browser SQL engine",
  "Pivot tables with two-way totals",
  "Cleaning recipes, undo, audit log",
  "PostgreSQL + MySQL connections",
  "AI chat & English→SQL (your own Gemini key)",
  "Power BI, Tableau, Excel, PDF, PNG, SVG, CSV export",
  "Team workspace bundles",
  "OCR + PDF table extraction",
];

export default function SleekLanding() {
  return (
    <div className="overflow-hidden">
      {/* ─── Hero ─── */}
      <section className="relative px-6 pb-8 pt-24 text-center md:pt-32">
        <Aurora className="opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent_75%)]" />
        <div className="aura absolute left-1/2 top-10 h-[420px] w-[680px] -translate-x-1/2" aria-hidden />

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative mx-auto max-w-3xl"
        >
          <motion.div variants={staggerItem}>
            <Link
              href="#toolkit"
              className="press inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-[13px] text-zinc-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Eleven tools, no account, no server
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            </Link>
          </motion.div>

          <motion.h1
            variants={staggerItem}
            className="mt-8 text-[clamp(2.75rem,7vw,5rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-white"
          >
            Upload data.
            <br />
            <span className="bg-gradient-to-b from-white via-white to-primary/70 bg-clip-text text-transparent">
              Get decisions.
            </span>
          </motion.h1>

          <motion.p
            variants={staggerItem}
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-on-surface-variant md:text-xl"
          >
            Clean, analyze, query, and report from one calm workspace. An entire data team in your
            browser, and nothing ever leaves your machine.
          </motion.p>

          <motion.div
            variants={staggerItem}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Magnetic strength={0.25} className="inline-block">
              <Link
                href="/launch"
                className="pill h-12 bg-primary px-7 text-[15px] text-on-primary shadow-[0_8px_30px_-8px_var(--primary)]"
              >
                Open the workspace
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Magnetic>
            <Link href="#toolkit" className="pill h-12 glass px-7 text-[15px] text-white">
              See every tool
            </Link>
          </motion.div>

          <motion.p variants={staggerItem} className="mt-5 text-[13px] text-zinc-600">
            Free forever · no account · runs 100% on your device
          </motion.p>
        </motion.div>

        <HeroLift className="relative mx-auto mt-16 max-w-5xl md:mt-20">
          <AppWindow />
        </HeroLift>
      </section>

      {/* ─── Sources ─── */}
      <Integrations />

      {/* ─── Facts, not usage claims ─── */}
      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-y-10 md:grid-cols-4">
          {FACTS.map((f, i) => (
            <Reveal key={f.label} delay={i * 0.06} className="px-4 text-center">
              <div className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                <Counter to={f.to} suffix={f.suffix} />
              </div>
              <p className="mt-2 text-[13px] text-on-surface-variant">{f.label}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mx-auto mt-10 max-w-lg text-center">
          <p className="text-[12.5px] leading-relaxed text-zinc-600">
            These are product limits and capabilities, not usage statistics. Nexora has no analytics
            and no server, so there is nothing here we could measure about you.
          </p>
        </Reveal>
      </section>

      {/* ─── The workflow ─── */}
      <section id="workflow" className="px-6 py-20">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-white md:text-5xl">
            Three steps, in the order
            <br />
            <span className="text-on-surface-variant">analysis actually happens.</span>
          </h2>
        </Reveal>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
          {WORKFLOW.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <Reveal key={stage.title} delay={i * 0.08}>
                <Link
                  href={stage.href}
                  className="group glass sheen sweep-on-hover flex h-full flex-col rounded-3xl p-7 transition-colors hover:border-primary/25"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12">
                      <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="font-mono text-[11px] tracking-widest text-zinc-600">
                      {stage.step}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{stage.title}</h3>
                  <p className="text-[14px] leading-relaxed text-on-surface-variant">{stage.body}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-white">
                    Open
                    <ArrowRight
                      className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ─── The full toolkit ─── */}
      <Toolkit />

      {/* ─── Free ─── */}
      <section id="pricing" className="px-6 py-20">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-white md:text-5xl">
            Everything is free
          </h2>
          <p className="mt-4 text-on-surface-variant">
            Nexora runs on your own machine, so there is nothing to meter and nothing to bill you
            for. Every feature below is available to everyone, and there is no paid tier to upgrade
            to.
          </p>
        </Reveal>

        <div className="mx-auto max-w-3xl">
          <Reveal className="h-full">
            <div className="relative glass sheen rounded-3xl p-8 shadow-[0_30px_60px_-30px_var(--primary)] ring-1 ring-primary/40">
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-primary">
                Free forever
              </span>
              <div className="mb-7 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-semibold tabular-nums text-white">$0</span>
                <span className="text-[13px] text-zinc-500">forever</span>
              </div>
              <ul className="mb-8 grid grid-cols-1 gap-x-8 gap-y-3 text-[13.5px] text-zinc-300 sm:grid-cols-2">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex justify-center">
                <Link href="/launch" className="pill h-11 bg-primary px-8 text-[14px] text-on-primary">
                  Start now for free
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <Faq />

      {/* ─── Final CTA ─── */}
      <section className="px-6 py-24">
        <Reveal className="relative mx-auto max-w-3xl overflow-hidden rounded-[32px] glass sheen px-6 py-20 text-center">
          <Aurora className="opacity-50" />
          <div className="aura absolute -top-20 left-1/2 h-[260px] w-[460px] -translate-x-1/2" aria-hidden />
          <h2 className="relative text-3xl font-semibold tracking-[-0.02em] text-white md:text-5xl">
            Drop a file and watch it profile.
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-on-surface-variant">
            No account, no upload to a server. The parsing happens in this tab, on your machine.
          </p>
          <div className="relative mt-9 flex justify-center">
            <Magnetic strength={0.3} className="inline-block">
              <Link
                href="/launch"
                className="pill h-12 bg-primary px-8 text-[15px] text-on-primary shadow-[0_10px_40px_-10px_var(--primary)]"
              >
                Open the workspace
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Magnetic>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
