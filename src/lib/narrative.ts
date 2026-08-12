/* The dashboard's editor.
 *
 * insights.ts finds things. This decides how to tell them: what leads, which
 * question each finding answers, and in what order a reader meets them. The
 * dashboard was a grid of charts that left the reader to work out which number
 * mattered, and the analysis to answer that was already being computed and
 * simply never shown.
 *
 * The questions are the ones an analyst is actually asked after handing over a
 * dashboard, in the order they get asked:
 *
 *   What happened?          the movements
 *   What is driving it?     what moves with them
 *   Where is the problem?   what is going wrong
 *   What is working?        what is going right
 *   What should I look at?  everything still open
 *
 * A finding is filed under exactly one of them. A critical revenue drop is
 * "what happened", and repeating it under "where is the problem" is how a
 * narrative stops being read. Nothing here writes prose about the data: every
 * sentence shown comes from the finding itself, because a business implication
 * this module invented would be indistinguishable from one the data supports. */

import type { Finding, Intelligence } from "./insights";

export type NarrativeSectionId =
  | "what-happened"
  | "whats-driving-it"
  | "where-the-problem-is"
  | "whats-working"
  | "what-to-investigate";

export interface NarrativeSection {
  id: NarrativeSectionId;
  question: string;
  /** one line of orientation under the question */
  note: string;
  /** highest score first */
  findings: Finding[];
}

export interface NarrativeLead {
  finding: Finding;
  /** the headline, quantified */
  keyFinding: string;
  /** null when the finding carries no impact or explanation to stand on */
  whatThisMeans: string | null;
  /** null when the finding suggests no next step */
  recommendedInvestigation: string | null;
}

export interface DashboardNarrative {
  lead: NarrativeLead | null;
  sections: NarrativeSection[];
  summary: string;
}

/** The questions, in reading order, with the rule for what belongs to each.
 *  Order matters twice over: it is the order they render, and it is the order
 *  a finding is tested against, which is what makes the filing exclusive. */
const QUESTIONS: {
  id: NarrativeSectionId;
  question: string;
  note: string;
  claims: (f: Finding) => boolean;
}[] = [
  {
    id: "what-happened",
    question: "What happened?",
    note: "The movements and changes worth knowing about first.",
    claims: (f) => f.kind === "trend" || f.kind === "change",
  },
  {
    id: "whats-driving-it",
    question: "What is driving it?",
    note: "Variables and segments that move with the changes above. Association, not proof of cause.",
    claims: (f) => f.kind === "correlation",
  },
  {
    id: "where-the-problem-is",
    question: "Where is the problem?",
    note: "Risks, gaps, and anything that will distort a conclusion if left alone.",
    claims: (f) =>
      f.kind === "risk" ||
      f.kind === "quality" ||
      f.kind === "outlier" ||
      f.severity === "critical" ||
      f.severity === "warning",
  },
  {
    id: "whats-working",
    question: "What is performing well?",
    note: "The parts worth protecting, and the openings worth taking.",
    claims: (f) => f.severity === "positive" || f.kind === "performance" || f.kind === "opportunity",
  },
  {
    id: "what-to-investigate",
    question: "What should you investigate next?",
    note: "Open questions the data raises but cannot settle on its own.",
    // The catch-all: anything that reached here belongs here.
    claims: () => true,
  },
];

const byScore = (a: Finding, b: Finding) => b.score - a.score;

/** Compose the findings into something that reads as an argument. */
export function buildNarrative(intel: Intelligence): DashboardNarrative {
  const findings = [...intel.findings].sort(byScore);

  const buckets = new Map<NarrativeSectionId, Finding[]>();
  for (const finding of findings) {
    const question = QUESTIONS.find((q) => q.claims(finding));
    if (!question) continue;
    const list = buckets.get(question.id) ?? [];
    list.push(finding);
    buckets.set(question.id, list);
  }

  const sections: NarrativeSection[] = QUESTIONS.filter((q) => (buckets.get(q.id) ?? []).length > 0)
    .map((q) => ({
      id: q.id,
      question: q.question,
      note: q.note,
      findings: (buckets.get(q.id) ?? []).sort(byScore),
    }));

  const top = findings[0];
  const lead: NarrativeLead | null = top
    ? {
        finding: top,
        keyFinding: `${top.title}. ${top.what}`.replace(/\.\s*\./g, "."),
        // impact is the business reading; why is the mechanism. Either is a
        // real sentence from the analysis. Neither present means we say
        // nothing rather than reaching for a template.
        whatThisMeans: top.impact ?? top.why ?? null,
        recommendedInvestigation: top.recommendation ?? null,
      }
    : null;

  return { lead, sections, summary: intel.summary };
}
