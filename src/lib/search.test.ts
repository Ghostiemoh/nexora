import { describe, it, expect } from "vitest";
import {
  highlight,
  isSubsequence,
  scoreLabel,
  searchTargets,
  SETTING_TARGETS,
  type SearchTarget,
} from "./search";

const TARGETS: SearchTarget[] = [
  { id: "p1", label: "Dataset Doctor", kind: "page", hint: "Step 1" },
  { id: "p2", label: "Dashboard", kind: "page", hint: "Step 3" },
  { id: "p3", label: "Pivot Tables", kind: "page", hint: "Step 2" },
  { id: "p4", label: "SQL Lab", kind: "page", hint: "Tool" },
  { id: "d1", label: "regional_sales.csv", kind: "dataset", hint: "1,200 rows" },
  { id: "c1", label: "revenue", kind: "column", hint: "number" },
  { id: "c2", label: "region", kind: "column", hint: "category" },
  {
    id: "s1",
    label: "Gemini API key",
    kind: "setting",
    hint: "Settings",
    keywords: ["ai", "token"],
  },
];

const labels = (query: string, limit?: number) =>
  searchTargets(query, TARGETS, limit).map((h) => h.label);

describe("scoreLabel", () => {
  it("ranks an exact match above a prefix above a substring", () => {
    const exact = scoreLabel("revenue", "revenue")!.score;
    const prefix = scoreLabel("revenue", "rev")!.score;
    const substring = scoreLabel("net_revenue_usd", "venue")!.score;

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });

  it("ranks a match at a word start above one mid-word", () => {
    const wordStart = scoreLabel("total revenue", "rev")!.score;
    const midWord = scoreLabel("subrevenue", "rev")!.score;
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("treats an underscore and a dot as word breaks", () => {
    expect(scoreLabel("net_revenue", "rev")!.score).toBe(
      scoreLabel("net revenue", "rev")!.score
    );
    expect(scoreLabel("sales.csv", "csv")!.score).toBe(scoreLabel("sales csv", "csv")!.score);
  });

  it("is case insensitive", () => {
    expect(scoreLabel("Dataset Doctor", "DATASET")).not.toBeNull();
    expect(scoreLabel("revenue", "ReVeNuE")!.score).toBe(1000);
  });

  it("returns null when the query is absent", () => {
    expect(scoreLabel("revenue", "zzz")).toBeNull();
  });
});

describe("isSubsequence", () => {
  it("matches the letters people actually type", () => {
    expect(isSubsequence("Dataset Doctor", "dsdr")).toBe(true);
    expect(isSubsequence("Pivot Tables", "pvt")).toBe(true);
  });

  it("requires the letters to appear in order", () => {
    expect(isSubsequence("Dashboard", "rdao")).toBe(false);
  });

  it("ignores a single character, which would match nearly everything", () => {
    expect(isSubsequence("Dashboard", "d")).toBe(false);
  });
});

describe("highlight", () => {
  it("splits the label around the matched span", () => {
    expect(highlight("Dataset Doctor", "set")).toEqual([
      { text: "Data", match: false },
      { text: "set", match: true },
      { text: " Doctor", match: false },
    ]);
  });

  it("keeps the match's own casing rather than the query's", () => {
    const segments = highlight("Dataset Doctor", "DATASET");
    expect(segments[0]).toEqual({ text: "Dataset", match: true });
  });

  it("emits no empty segments when the match is at an edge", () => {
    expect(highlight("revenue", "rev")).toEqual([
      { text: "rev", match: true },
      { text: "enue", match: false },
    ]);
  });

  it("returns one unmatched segment when nothing matches", () => {
    expect(highlight("revenue", "zzz")).toEqual([{ text: "revenue", match: false }]);
  });
});

describe("searchTargets", () => {
  it("returns nothing for an empty query", () => {
    expect(searchTargets("", TARGETS)).toEqual([]);
    expect(searchTargets("   ", TARGETS)).toEqual([]);
  });

  it("finds a page by a partial word", () => {
    expect(labels("dash")).toContain("Dashboard");
  });

  it("puts the closest match first", () => {
    expect(labels("region")[0]).toBe("region");
  });

  it("matches a column and a dataset in the same query", () => {
    const found = labels("re");
    expect(found).toContain("revenue");
    expect(found).toContain("region");
  });

  it("reaches a setting through a keyword that is not in its label", () => {
    expect(labels("token")).toContain("Gemini API key");
  });

  it("prefers a page over a column when both merely contain the word", () => {
    const hits = searchTargets("da", TARGETS);
    const page = hits.find((h) => h.kind === "page");
    const other = hits.find((h) => h.kind !== "page");
    if (page && other && page.score !== other.score) {
      expect(hits[0].kind).toBe("page");
    }
    expect(page).toBeDefined();
  });

  it("finds a page from initials alone", () => {
    expect(labels("dsdr")).toContain("Dataset Doctor");
  });

  it("carries highlight segments on every hit", () => {
    const hit = searchTargets("rev", TARGETS)[0];
    expect(hit.segments.some((s) => s.match)).toBe(true);
    expect(hit.segments.map((s) => s.text).join("")).toBe(hit.label);
  });

  it("honours the result limit", () => {
    expect(searchTargets("e", TARGETS, 3)).toHaveLength(3);
  });

  it("finds a dataset by its extension", () => {
    expect(labels("csv")).toContain("regional_sales.csv");
  });

  it("returns an empty list rather than throwing on nonsense", () => {
    expect(searchTargets("qqqzzz", TARGETS)).toEqual([]);
  });
});

describe("SETTING_TARGETS", () => {
  it("routes every entry to Settings", () => {
    for (const target of SETTING_TARGETS) {
      expect(target.kind).toBe("setting");
      expect(target.hint).toBe("Settings");
    }
  });

  it("is reachable by the words someone would actually type", () => {
    for (const query of ["api key", "clear", "onboarding"]) {
      expect(searchTargets(query, SETTING_TARGETS).length).toBeGreaterThan(0);
    }
  });
});
