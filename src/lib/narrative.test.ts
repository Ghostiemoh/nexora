/* Turning findings into a story.
 *
 * The analysis engine already produces good findings. The dashboard just never
 * showed them, so it read as a wall of charts that left the reader to work out
 * which number mattered. This module is the editor: it decides what leads,
 * which question each finding answers, and what gets left out.
 *
 * Two rules it must not break:
 *
 *  1. A finding appears once. A critical revenue trend is "what happened", not
 *     "what happened" and again under "where the problem is". Repetition is
 *     how a narrative stops being read.
 *  2. Nothing is invented. If a finding carries no impact line, the narrative
 *     does not manufacture one, because a fabricated business implication is
 *     worse than a missing one. */

import { describe, it, expect } from "vitest";
import { buildNarrative } from "./narrative";
import type { Finding, Intelligence } from "./insights";

function finding(over: Partial<Finding> & { id: string }): Finding {
  return {
    kind: "trend",
    severity: "info",
    title: `Title ${over.id}`,
    what: `What ${over.id}`,
    columns: [],
    score: 50,
    ...over,
  };
}

const intel = (findings: Finding[], summary = "Summary paragraph."): Intelligence => ({
  findings,
  summary,
  recommendations: [],
});

describe("buildNarrative", () => {
  it("says nothing when there is nothing to say", () => {
    const n = buildNarrative(intel([]));
    expect(n.lead).toBeNull();
    expect(n.sections).toEqual([]);
  });

  it("carries the executive summary through unchanged", () => {
    expect(buildNarrative(intel([], "Revenue rose 12%.")).summary).toBe("Revenue rose 12%.");
  });

  describe("the lead", () => {
    it("leads with the highest-scoring finding", () => {
      const n = buildNarrative(
        intel([
          finding({ id: "a", score: 10 }),
          finding({ id: "b", score: 90, title: "The big one" }),
          finding({ id: "c", score: 50 }),
        ])
      );
      expect(n.lead?.finding.id).toBe("b");
      expect(n.lead?.keyFinding).toContain("The big one");
    });

    it("uses the finding's own impact line for what it means", () => {
      const n = buildNarrative(
        intel([finding({ id: "a", score: 90, impact: "Margin is carrying the growth." })])
      );
      expect(n.lead?.whatThisMeans).toBe("Margin is carrying the growth.");
    });

    it("falls back to the explanation when there is no impact line", () => {
      const n = buildNarrative(
        intel([finding({ id: "a", score: 90, why: "Two products drove it." })])
      );
      expect(n.lead?.whatThisMeans).toBe("Two products drove it.");
    });

    /* The rule that keeps this honest. */
    it("leaves the meaning empty rather than inventing one", () => {
      const n = buildNarrative(intel([finding({ id: "a", score: 90 })]));
      expect(n.lead?.whatThisMeans).toBeNull();
    });

    it("leaves the investigation empty rather than inventing one", () => {
      const n = buildNarrative(intel([finding({ id: "a", score: 90 })]));
      expect(n.lead?.recommendedInvestigation).toBeNull();
    });

    it("uses the recommendation when the finding has one", () => {
      const n = buildNarrative(
        intel([finding({ id: "a", score: 90, recommendation: "Check retention by cohort." })])
      );
      expect(n.lead?.recommendedInvestigation).toBe("Check retention by cohort.");
    });
  });

  describe("sections", () => {
    const all = intel([
      finding({ id: "t", kind: "trend", score: 80 }),
      finding({ id: "c", kind: "change", score: 70 }),
      finding({ id: "k", kind: "correlation", score: 60 }),
      finding({ id: "r", kind: "risk", severity: "critical", score: 95 }),
      finding({ id: "q", kind: "quality", severity: "warning", score: 40 }),
      finding({ id: "p", kind: "performance", severity: "positive", score: 55 }),
      finding({ id: "o", kind: "opportunity", severity: "positive", score: 45 }),
    ]);

    it("answers what happened with movements", () => {
      const s = buildNarrative(all).sections.find((x) => x.id === "what-happened");
      expect(s?.findings.map((f) => f.id).sort()).toEqual(["c", "t"]);
    });

    it("answers what is driving it with associations", () => {
      const s = buildNarrative(all).sections.find((x) => x.id === "whats-driving-it");
      expect(s?.findings.map((f) => f.id)).toContain("k");
    });

    it("answers where the problem is with risks and quality", () => {
      const s = buildNarrative(all).sections.find((x) => x.id === "where-the-problem-is");
      expect(s?.findings.map((f) => f.id).sort()).toEqual(["q", "r"]);
    });

    it("answers what is performing well with the positives", () => {
      const s = buildNarrative(all).sections.find((x) => x.id === "whats-working");
      expect(s?.findings.map((f) => f.id).sort()).toEqual(["o", "p"]);
    });

    /* Rule 1. */
    it("never files the same finding under two questions", () => {
      const sections = buildNarrative(all).sections;
      const ids = sections.flatMap((s) => s.findings.map((f) => f.id));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("files every finding somewhere, so nothing is silently dropped", () => {
      const sections = buildNarrative(all).sections;
      const ids = sections.flatMap((s) => s.findings.map((f) => f.id)).sort();
      expect(ids).toEqual(["c", "k", "o", "p", "q", "r", "t"]);
    });

    it("omits a question it has no findings for", () => {
      const n = buildNarrative(intel([finding({ id: "t", kind: "trend" })]));
      expect(n.sections.map((s) => s.id)).toEqual(["what-happened"]);
    });

    it("orders findings inside a section by score", () => {
      const n = buildNarrative(
        intel([
          finding({ id: "low", kind: "trend", score: 10 }),
          finding({ id: "high", kind: "trend", score: 90 }),
        ])
      );
      const s = n.sections.find((x) => x.id === "what-happened");
      expect(s?.findings.map((f) => f.id)).toEqual(["high", "low"]);
    });

    it("keeps the sections in the order the questions should be read", () => {
      const order = buildNarrative(all).sections.map((s) => s.id);
      expect(order).toEqual([
        "what-happened",
        "whats-driving-it",
        "where-the-problem-is",
        "whats-working",
      ]);
    });

    it("gives every section a question a person would actually ask", () => {
      for (const s of buildNarrative(all).sections) {
        expect(s.question.endsWith("?")).toBe(true);
      }
    });
  });

  describe("what to investigate", () => {
    it("collects findings that fit no other question", () => {
      const n = buildNarrative(
        intel([finding({ id: "i", kind: "target", severity: "info", score: 30 })])
      );
      const s = n.sections.find((x) => x.id === "what-to-investigate");
      expect(s?.findings.map((f) => f.id)).toEqual(["i"]);
    });
  });
});
