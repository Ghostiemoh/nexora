/* Workspace search.
 *
 * The rule this follows: a result is worth showing only if the reader can tell,
 * from the row alone, what it is and where it goes. So every hit carries a
 * plain label, a kind, and the matched span highlighted in place — no icon
 * soup, no ranked mystery, no result that turns out to be a dead link.
 *
 * Matching is deliberately forgiving in the ways typing is unreliable: a
 * prefix, a word start anywhere in the label, a bare substring, and a
 * loose subsequence for the letters people actually type ("dsdr" finds Dataset
 * Doctor). Ranking then puts the least surprising match first.
 *
 * Pure logic, no UI. */

export type SearchKind = "page" | "dataset" | "column" | "setting" | "tool";

export interface SearchTarget {
  id: string;
  /** what the row reads as */
  label: string;
  kind: SearchKind;
  /** the small right-hand caption: where this lives or what it is */
  hint: string;
  /** extra words that should match but are not shown */
  keywords?: string[];
}

export interface Segment {
  text: string;
  match: boolean;
}

export interface SearchHit extends SearchTarget {
  score: number;
  /** the label split so the matched span can be emphasised in place */
  segments: Segment[];
}

const KIND_WEIGHT: Record<SearchKind, number> = {
  page: 6,
  dataset: 5,
  tool: 4,
  column: 3,
  setting: 2,
};

/* Scores, highest first: an exact hit should never sit under a fuzzy one. */
const EXACT = 1000;
const PREFIX = 800;
const WORD_START = 600;
const SUBSTRING = 400;
const KEYWORD = 250;
const SUBSEQUENCE = 100;

/** Where a query matches a label, and how well. Returns null for no match. */
export function scoreLabel(label: string, query: string): { score: number; at: number } | null {
  const haystack = label.toLowerCase();
  const needle = query.toLowerCase();

  if (haystack === needle) return { score: EXACT, at: 0 };
  if (haystack.startsWith(needle)) return { score: PREFIX, at: 0 };

  const at = haystack.indexOf(needle);
  if (at > 0) {
    // A match that starts a word reads as intentional; one mid-word is weaker.
    const preceding = haystack[at - 1];
    const atWordStart = /[\s_\-./]/.test(preceding);
    return { score: atWordStart ? WORD_START : SUBSTRING, at };
  }

  return null;
}

/** True when every character of the query appears in order. */
export function isSubsequence(label: string, query: string): boolean {
  const haystack = label.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, "");
  if (needle.length < 2) return false;

  let cursor = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return false;
    cursor = found + 1;
  }
  return true;
}

/** Split a label so the matched span can be rendered emphasised. */
export function highlight(label: string, query: string): Segment[] {
  const at = label.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at === -1 || query.trim() === "") return [{ text: label, match: false }];

  const end = at + query.trim().length;
  return [
    { text: label.slice(0, at), match: false },
    { text: label.slice(at, end), match: true },
    { text: label.slice(end), match: false },
  ].filter((segment) => segment.text !== "");
}

/** Rank targets against a query. */
export function searchTargets(
  query: string,
  targets: readonly SearchTarget[],
  limit = 10
): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const target of targets) {
    const direct = scoreLabel(target.label, trimmed);
    let score = direct?.score ?? 0;

    if (score === 0) {
      const keywordHit = (target.keywords ?? []).some((k) => scoreLabel(k, trimmed) !== null);
      if (keywordHit) score = KEYWORD;
      else if (isSubsequence(target.label, trimmed)) score = SUBSEQUENCE;
    }

    if (score === 0) continue;

    hits.push({
      ...target,
      // Kind breaks ties between equally good text matches, so a page beats a
      // column when both merely contain the word.
      score: score + KIND_WEIGHT[target.kind],
      segments: highlight(target.label, trimmed),
    });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.label.length - b.label.length || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** The settings and workspace actions search should be able to reach. Kept
 *  here rather than in the navbar so the list is testable and has one home. */
export const SETTING_TARGETS: SearchTarget[] = [
  {
    id: "set-gemini",
    label: "Gemini API key",
    kind: "setting",
    hint: "Settings",
    keywords: ["ai", "api", "key", "gemini", "integration", "token"],
  },
  {
    id: "set-storage",
    label: "Local storage and workspace data",
    kind: "setting",
    hint: "Settings",
    keywords: ["clear", "reset", "storage", "cache", "privacy", "delete"],
  },
  {
    id: "set-datasets",
    label: "Datasets in this workspace",
    kind: "setting",
    hint: "Settings",
    keywords: ["remove", "delete", "manage", "files"],
  },
  {
    id: "set-checklist",
    label: "Getting started checklist",
    kind: "setting",
    hint: "Settings",
    keywords: ["onboarding", "tour", "restore", "help"],
  },
];
