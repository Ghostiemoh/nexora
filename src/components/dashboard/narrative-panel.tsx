"use client";

/* The story, above the charts.
 *
 * A dashboard that opens with twelve tiles asks the reader to find the point
 * themselves. This opens with the point: one lead finding told in three beats,
 * then the four or five questions the rest of the analysis answers, each with
 * the findings that answer it.
 *
 * Every sentence rendered here comes from the analysis. The component chooses
 * arrangement and emphasis, never wording, so there is no path by which a
 * confident-sounding claim reaches the screen without the data behind it. */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Compass,
  Sparkle,
  TrendingUp,
  Link2,
  ShieldAlert,
  Trophy,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { Dataset } from "@/lib/types";
import { analyzeCached, type Finding, type Severity } from "@/lib/insights";
import { buildNarrative, type NarrativeSectionId } from "@/lib/narrative";

const SECTION_ICON: Record<NarrativeSectionId, LucideIcon> = {
  "what-happened": TrendingUp,
  "whats-driving-it": Link2,
  "where-the-problem-is": ShieldAlert,
  "whats-working": Trophy,
  "what-to-investigate": HelpCircle,
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  warning: "bg-amber-400",
  info: "bg-sky-400",
  positive: "bg-emerald-400",
};

function FindingLine({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const detail = [finding.why, finding.impact, finding.recommendation].filter(Boolean);

  return (
    <li className="border-t border-white/[0.05] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={detail.length === 0}
        className="press flex w-full items-start gap-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.02] disabled:cursor-default enabled:cursor-pointer"
      >
        <span
          className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[finding.severity]}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-snug text-on-surface">
            {finding.title}
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-on-surface-variant">
            {finding.what}
          </span>
        </span>
        {detail.length > 0 && (
          <ChevronDown
            className={`mt-1 h-3.5 w-3.5 shrink-0 text-on-surface-variant transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        )}
      </button>
      {open && detail.length > 0 && (
        <div className="space-y-2 pb-3 pl-6 pr-2">
          {finding.why && (
            <Detail label="Why it may have happened" body={finding.why} />
          )}
          {finding.impact && <Detail label="What it means" body={finding.impact} />}
          {finding.recommendation && (
            <Detail label="What to do next" body={finding.recommendation} accent />
          )}
        </div>
      )}
    </li>
  );
}

function Detail({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <div>
      <span className="block text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/80">
        {label}
      </span>
      <p className={`mt-0.5 text-[12px] leading-relaxed ${accent ? "text-primary" : "text-on-surface"}`}>
        {body}
      </p>
    </div>
  );
}

export function NarrativePanel({ dataset }: { dataset: Dataset }) {
  const narrative = buildNarrative(analyzeCached(dataset));

  if (!narrative.lead && narrative.sections.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      aria-labelledby="narrative-heading"
      className="space-y-3"
    >
      <div className="flex items-center gap-2 px-1">
        <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="narrative-heading" className="text-lg font-semibold tracking-tight text-white">
          What this data is saying
        </h2>
      </div>

      {/* The lead, in the three beats a finding is worth reading in. */}
      {narrative.lead && (
        <div className="nexora-ai-card p-5">
          <div className="flex items-start gap-3">
            <Sparkle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 space-y-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Key finding
                </span>
                <p className="mt-1 text-[14px] font-medium leading-relaxed text-white">
                  {narrative.lead.keyFinding}
                </p>
              </div>

              {narrative.lead.whatThisMeans && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    What this means
                  </span>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-on-surface">
                    {narrative.lead.whatThisMeans}
                  </p>
                </div>
              )}

              {narrative.lead.recommendedInvestigation && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Recommended investigation
                  </span>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-primary">
                    {narrative.lead.recommendedInvestigation}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* The questions, each answered by the findings filed under it.

          items-start matters: a question with one finding next to a question
          with three would otherwise stretch to match it, and a bordered card
          enclosing a large empty area reads as something failed to load. Left
          to size itself, it just looks like a shorter card. CSS columns would
          pack them tighter still, but findings expand on click, and reflowing
          a card into another column under the reader's cursor is a worse
          trade than a little whitespace. */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {narrative.sections.map((section) => {
          const Icon = SECTION_ICON[section.id];
          return (
            <div key={section.id} className="nexora-card flex flex-col p-4">
              <div className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-[13.5px] font-semibold text-white">{section.question}</h3>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-on-surface-variant">
                    {section.note}
                  </p>
                </div>
              </div>
              <ul className="mt-2.5 border-t border-white/[0.06] pt-0.5">
                {section.findings.slice(0, 4).map((f) => (
                  <FindingLine key={f.id} finding={f} />
                ))}
              </ul>
              {section.findings.length > 4 && (
                <p className="mt-2 text-[11px] text-on-surface-variant/70">
                  {section.findings.length - 4} more in the full report.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
