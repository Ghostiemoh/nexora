import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Aurora } from "./aurora";

/** The shell every written page on the marketing site uses: docs, policies,
 *  company, changelog. One layout, so they read as one publication. */
export function ProsePage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  /** ISO date this page was last revised */
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative px-6 pb-24 pt-20">
      <Aurora className="opacity-40 [mask-image:radial-gradient(ellipse_60%_40%_at_50%_0%,black,transparent_75%)]" />

      <article className="relative mx-auto max-w-3xl">
        <header className="mb-12">
          <p className="text-[12px] uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h1 className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            {title}
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-on-surface-variant">{intro}</p>
          {updated && (
            <p className="mt-4 font-mono text-[11px] text-zinc-600">Last updated {updated}</p>
          )}
        </header>

        <div className="space-y-10">{children}</div>

        <footer className="mt-16 border-t border-white/[0.07] pt-8">
          <Link
            href="/launch"
            className="press inline-flex items-center gap-2 text-[15px] font-medium text-white"
          >
            Open the workspace
            <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
          </Link>
        </footer>
      </article>
    </div>
  );
}

/** A titled block of prose. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-on-surface-variant">{children}</div>
    </section>
  );
}

/** A bulleted list with the house marker. */
export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-on-surface-variant">
          <span className="mt-[3px] shrink-0 text-primary" aria-hidden="true">▸</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A short definition row, used for limits and reference tables. */
export function Facts({ rows }: { rows: { term: string; detail: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07]">
      {rows.map((row) => (
        <div key={row.term} className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-[200px_1fr] sm:gap-4">
          <dt className="text-[13.5px] font-medium text-white">{row.term}</dt>
          <dd className="text-[14px] leading-relaxed text-on-surface-variant">{row.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
