/* Nexora makes strong privacy promises, and three features quietly break the
 * strongest version of them: database imports POST the connection string and
 * the result rows through /api/db/*, the AI analyst ships column stats and the
 * first five rows to Google, and sync uploads ciphertext. All three are opt-in,
 * and all three are fine. What is not fine is copy that tells a user none of it
 * happens.
 *
 * Absolute phrasings like "nothing leaves this device" are the easiest thing in
 * the world to write and the hardest to notice going stale, because they read
 * as reassurance rather than as a claim. This test treats them as a claim and
 * fails the build when one appears in user-facing source, the same way
 * sync-payload.test.ts fails the build when a secret enters the sync payload.
 *
 * If a phrase here becomes genuinely true one day, delete it from the list in
 * the same commit that makes it true. */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");

/** Every .ts/.tsx file under src/, minus the tests that talk about the rules. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Absolute claims the architecture does not support.
 *
 *  Each is a regex plus the reason it is false, so a failure explains itself
 *  instead of just pointing at a line. */
const BANNED: { pattern: RegExp; why: string }[] = [
  {
    pattern: /nothing\s+(?:ever\s+)?leaves\s+(?:this|your)\s+(?:device|machine|browser)/i,
    why: "Database imports send the connection string and rows to /api/db/*, and the AI analyst sends sample rows to Google. Neither requires an account.",
  },
  {
    pattern: /(?:datasets?|files?|data)\s+never\s+leaves?\s+(?:this|your)\s+(?:device|machine|browser)/i,
    why: "The AI analyst sends the first five rows and per-column top values to Google Gemini.",
  },
  {
    pattern: /no\s+(?:analytical\s+)?data\s+is\s+(?:ever\s+)?(?:uploaded|sent|transmitted)/i,
    why: "Gemini requests carry real cell values; database imports carry whole result sets.",
  },
  {
    pattern: /connection\s+strings?\s+stays?\s+in\s+(?:this|your)\s+browser/i,
    why: "The connection string is POSTed to /api/db/test and /api/db/query on every test and import.",
  },
  {
    pattern: /(?:completely|entirely|fully)\s+private/i,
    why: "Unqualified absolutes cannot be verified against three separate egress paths.",
  },
  {
    pattern: /nothing\s+is\s+sent\s+to\s+our\s+servers/i,
    why: "The database query API is our server, and every imported row passes through it.",
  },
  /* Found by looking at the running app rather than by reading the code: the
   * sync card and the marketing FAQ both said this, and it is the same claim
   * as "nothing leaves this device" wearing different words. Signing in gates
   * sync and nothing else. Say "sync uploads nothing until you sign in" if
   * that is what you mean. */
  {
    pattern: /nothing\s+is\s+uploaded\s+until/i,
    why: "Signing in gates sync only. Database imports and AI requests both upload without an account, so scope the sentence to sync explicitly.",
  },
  /* SYNCED_KINDS in sync-payload.ts includes "dataset". When sync is on, whole
   * datasets go up as sealed blobs, so any sentence claiming they stayed put
   * is describing the sync-off case while sitting in the sync-on panel. */
  {
    pattern: /datasets?\s+(?:have\s+not|has\s+not|did\s+not|never)\s+left/i,
    why: "Sync uploads datasets as encrypted blobs. Say they are sealed rather than that they stayed.",
  },
];

/* Deliberately NOT banned: "no upload", "no upload endpoint", "nothing uploads
 * in the background". Every one of those is true as written. There is no upload
 * endpoint for files, and the two paths that do reach the network are started
 * by the user in the foreground. A pattern broad enough to catch a bad "no
 * upload" also catches those, and a test that flags correct sentences trains
 * people to weaken correct sentences. The rule stays narrow on purpose: it
 * bans claims that are false, not words that sound risky. */

/** The OCR pipeline genuinely is local: pdf.js and Tesseract both run in the
 *  tab and the file is never uploaded. Its claim is allowed to stay absolute,
 *  so the rule is scoped to the file rather than the phrase. */
const ALLOWED: { file: RegExp; pattern: RegExp }[] = [
  {
    file: /ocr-center[\\/]page\.tsx$/,
    pattern: /(?:file|files?)\s+never\s+leaves?\s+your\s+device/i,
  },
];

function isAllowed(file: string, line: string): boolean {
  return ALLOWED.some((a) => a.file.test(file) && a.pattern.test(line));
}

/** Remove the two places a banned phrase can legitimately appear: a code
 *  comment recording why the claim was removed, and prose that quotes the
 *  phrase in typographic quotes in order to disown it ("saying X would be
 *  wrong"). What is left is the text that actually asserts something. */
function stripNonClaims(line: string): string {
  return line
    .replace(/\{?\s*\/\*[\s\S]*$/, "")
    .replace(/\/\/.*$/, "")
    .replace(/^\s*\*.*$/, "")
    .replace(/&ldquo;[\s\S]*?&rdquo;/g, "")
    .replace(/[“”][^“”]*[“”]/g, "");
}

describe("privacy copy matches the architecture", () => {
  const files = sourceFiles(SRC);

  it("finds source to check, so a broken glob cannot pass silently", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const { pattern, why } of BANNED) {
    it(`makes no claim matching ${pattern.source.slice(0, 44)}…`, () => {
      const hits: string[] = [];

      for (const file of files) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          const code = stripNonClaims(line);
          if (pattern.test(code) && !isAllowed(file, code)) {
            hits.push(`${file.replace(SRC, "src")}:${i + 1}  ${line.trim()}`);
          }
        });
      }

      expect(hits, `${why}\n\n${hits.join("\n")}`).toEqual([]);
    });
  }
});

describe("the AI disclosure stays honest about sample rows", () => {
  it("keeps buildSchemaContext's row sampling visible in ai.ts", () => {
    const ai = readFileSync(join(SRC, "lib", "ai.ts"), "utf8");
    // If sampling ever stops, the Settings and Privacy copy that promises
    // "the first five rows" is overstating and should be revisited.
    expect(ai).toMatch(/dataset\.rows\.slice\(0,\s*sampleRows\)/);
  });

  it("never puts the API key in the request URL", () => {
    const ai = readFileSync(join(SRC, "lib", "ai.ts"), "utf8");
    expect(ai).not.toMatch(/\?key=\$\{/);
    expect(ai).toMatch(/"x-goog-api-key"/);
  });
});
