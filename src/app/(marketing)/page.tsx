"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Stethoscope,
  Sparkles,
  Database,
  ScanLine,
  ChevronRight,
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
import { Testimonials } from "@/components/marketing/testimonials";
import { Faq } from "@/components/marketing/faq";

/* ════════════════════════════════════════════════
   NEXORA — landing "sleek" · Apple / iOS grade
   Airy, frosted glass, soft depth, spring motion,
   one periwinkle accent. Calm over loud.
   ════════════════════════════════════════════════ */

const STATS = [
  { to: 84.6, decimals: 1, suffix: "M", label: "Rows profiled in-browser" },
  { to: 47, suffix: "s", label: "To first insight" },
  { to: 11, label: "Formats parsed" },
  { to: 99.9, decimals: 1, suffix: "%", label: "Stays on your device" },
];

const FEATURES = [
  {
    icon: Stethoscope,
    title: "Dataset Doctor",
    body: "Every upload is scored for completeness, validity, and uniqueness. Defects are named and located, each with a one-click fix you approve.",
  },
  {
    icon: Sparkles,
    title: "Axiom analyst",
    body: "Ask in plain language. Axiom writes the SQL, runs it locally, and answers with the chart and how confident it is.",
  },
  {
    icon: Database,
    title: "SQL Lab",
    body: "A real in-memory engine. Joins, filters, and aggregates against your file, with results in milliseconds.",
  },
  {
    icon: ScanLine,
    title: "OCR ingestion",
    body: "Drop a scanned invoice or table and pull it into a clean, editable spreadsheet, ready to profile.",
  },
];

const FREE_FEATURES = [
  "Dataset Doctor with one-click fixes",
  "Auto dashboard + insights",
  "In-browser SQL sandbox",
  "Cleaning recipes, undo, audit log",
  "PostgreSQL + MySQL connections",
  "AI chat & English→SQL (your own free Gemini key)",
  "CSV, Excel, and PDF reports",
  "Team workspace bundles",
  "OCR + PDF table extraction",
  "Your data never leaves your device",
];

export default function SleekLanding() {
  return (
    <div className="overflow-hidden">
      {/* ─── Hero ─── */}
      <section className="relative px-6 pt-24 md:pt-32 pb-8 text-center">
        {/* aurora + soft aura */}
        <Aurora className="opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent_75%)]" />
        <div className="absolute left-1/2 top-10 -translate-x-1/2 w-[680px] h-[420px] aura" aria-hidden />

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative max-w-3xl mx-auto"
        >
          <motion.div variants={staggerItem}>
            <Link
              href="#features"
              className="press inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-[13px] text-zinc-300"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Client-side SQL engine, now live
              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
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
            className="mt-6 text-lg md:text-xl text-on-surface-variant max-w-xl mx-auto leading-relaxed"
          >
            Clean, analyze, query, and report from one calm workspace. An entire data team in your
            browser, and nothing ever leaves your machine.
          </motion.p>

          <motion.div
            variants={staggerItem}
            className="mt-9 flex flex-col sm:flex-row gap-3 justify-center items-center"
          >
            <Magnetic strength={0.25} className="inline-block">
              <Link
                href="/dashboard"
                className="pill bg-primary text-on-primary px-7 h-12 text-[15px] shadow-[0_8px_30px_-8px_var(--primary)]"
              >
                Open the workspace
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Magnetic>
            <Link
              href="/demo"
              className="pill glass px-7 h-12 text-[15px] text-white"
            >
              Watch the demo
            </Link>
          </motion.div>

          <motion.p variants={staggerItem} className="mt-5 text-[13px] text-zinc-600">
            Free forever · no account · runs 100% on your device
          </motion.p>
        </motion.div>

        {/* device */}
        <HeroLift className="relative max-w-5xl mx-auto mt-16 md:mt-20">
          <AppWindow />
        </HeroLift>
      </section>

      {/* ─── Integrations ─── */}
      <Integrations />

      {/* ─── Stats ─── */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-y-10">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06} className="text-center px-4">
              <div className="text-4xl md:text-5xl font-semibold text-white tracking-tight">
                <Counter to={s.to} decimals={s.decimals} suffix={s.suffix} />
              </div>
              <p className="mt-2 text-[13px] text-on-surface-variant">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="px-6 py-20">
        <Reveal className="max-w-2xl mx-auto text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-[-0.02em] text-white">
            Everything the data needs.
            <br />
            <span className="text-on-surface-variant">Nothing it doesn&apos;t.</span>
          </h2>
        </Reveal>

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={i * 0.07}>
                <div className="glass sheen sweep-on-hover rounded-3xl p-7 h-full">
                  <div className="w-11 h-11 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-[14px] text-on-surface-variant leading-relaxed">{f.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ─── Showcase row — Axiom conversation ─── */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <span className="text-[13px] font-medium text-primary">Axiom</span>
            <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-white">
              Ask the question you actually have.
            </h2>
            <p className="mt-4 text-[15px] text-on-surface-variant leading-relaxed max-w-md">
              No query language to learn. Axiom translates plain English into SQL, runs it against
              your data, and shows you the query behind every answer.
            </p>
            <Link
              href="/workspace"
              className="press mt-6 inline-flex items-center gap-2 text-[15px] font-medium text-white"
            >
              See Axiom work
              <ArrowRight className="w-4 h-4 text-primary" />
            </Link>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="glass sheen rounded-3xl p-5 space-y-3">
              <div className="ml-auto max-w-[82%] bg-black/30 border border-white/[0.05] rounded-2xl rounded-tr-md px-4 py-2.5 text-[13.5px] text-zinc-200">
                Which accounts dropped API usage by more than 40% this month?
              </div>
              <div className="max-w-[88%] bg-primary/[0.07] border border-primary/20 rounded-2xl rounded-tl-md px-4 py-3">
                <p className="text-[13.5px] text-zinc-200 mb-2">
                  423 Enterprise accounts match. That cluster correlates with churn at 0.81, table
                  and chart are on your canvas.
                </p>
                <p className="font-mono text-[11px] text-primary/90">
                  SELECT account_id, delta_14d FROM usage_rollup WHERE …
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <Testimonials />

      {/* ─── Free ─── */}
      <section id="pricing" className="px-6 py-20">
        <Reveal className="max-w-2xl mx-auto text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-[-0.02em] text-white">
            Everything is free
          </h2>
          <p className="mt-4 text-on-surface-variant">
            Nexora runs on your own machine, so there is nothing to meter and nothing to bill you
            for. Every feature below is available to everyone, and there is no paid tier to upgrade
            to.
          </p>
        </Reveal>

        <div className="max-w-3xl mx-auto">
          <Reveal className="h-full">
            <div className="relative glass sheen ring-1 ring-primary/40 rounded-3xl p-8 shadow-[0_30px_60px_-30px_var(--primary)]">
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-semibold uppercase tracking-wide">
                Free forever
              </span>
              <div className="flex items-baseline gap-1 mb-7 justify-center">
                <span className="text-5xl font-semibold text-white tabular-nums">$0</span>
                <span className="text-[13px] text-zinc-500">forever</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[13.5px] text-zinc-300 mb-8">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex justify-center">
                <Link href="/dashboard" className="pill h-11 px-8 text-[14px] bg-primary text-on-primary">
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
        <Reveal className="relative max-w-3xl mx-auto text-center glass sheen rounded-[32px] px-6 py-20 overflow-hidden">
          <Aurora className="opacity-50" />
          <div className="absolute left-1/2 -top-20 -translate-x-1/2 w-[460px] h-[260px] aura" aria-hidden />
          <h2 className="relative text-3xl md:text-5xl font-semibold tracking-[-0.02em] text-white">
            Your first dataset takes 47 seconds.
          </h2>
          <p className="relative mt-4 text-on-surface-variant max-w-md mx-auto">
            No account, no upload to a server. Drop a file and watch it profile right here.
          </p>
          <div className="relative mt-9 flex justify-center">
            <Magnetic strength={0.3} className="inline-block">
              <Link
                href="/dashboard"
                className="pill bg-primary text-on-primary px-8 h-12 text-[15px] shadow-[0_10px_40px_-10px_var(--primary)]"
              >
                Open the workspace
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Magnetic>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
