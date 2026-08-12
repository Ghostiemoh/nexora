/* Layout consistency, enforced.
 *
 * The app had drifted to five different page max-widths and six different
 * padding combinations, so moving between sections nudged the content sideways
 * and up by a few pixels. Nobody adds that on purpose. It happens one page at
 * a time, each time by someone reasonably picking a value that looks right on
 * the page they happen to be building.
 *
 * A reviewer will not catch the sixth variant either, so this test does. It is
 * deliberately about the container only: everything inside a page is free. */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PAGE_WIDE, PAGE_NARROW, PAGE_CENTERED, SHELL_PAD } from "../components/layout/page-shell";

const APP_DIR = join(__dirname, "..", "app", "(app)");

function pageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pageFiles(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

/** A root container is one that centres itself and sets a max width. Those are
 *  the two things that decide where a page sits on screen. */
const ROOT_CONTAINER = /className=(?:"|\{`)[^"`]*\bmx-auto\b[^"`]*\bmax-w-/g;

describe("page shell", () => {
  const files = pageFiles(APP_DIR);

  it("finds the app's pages, so a broken path cannot pass silently", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("keeps one padding scale for every shell constant", () => {
    for (const shell of [PAGE_WIDE, PAGE_NARROW, PAGE_CENTERED]) {
      expect(shell).toContain(SHELL_PAD);
    }
  });

  it("offers exactly two widths, so 'wide or narrow' stays a real decision", () => {
    expect(PAGE_WIDE).toContain("max-w-[1440px]");
    expect(PAGE_NARROW).toContain("max-w-4xl");
  });

  /* The regression itself: a page that hand-rolls mx-auto + max-w- has opted
   * out of the shared container and will drift. */
  it("has no page hand-rolling its own root container", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(ROOT_CONTAINER)) {
        const literal = match[0];
        // Inline literals are the problem; interpolated shell constants are
        // the fix, and those never carry mx-auto in the literal itself.
        if (literal.startsWith('className="')) {
          offenders.push(`${file.replace(APP_DIR, "")}: ${literal.slice(0, 90)}`);
        }
      }
    }

    expect(
      offenders,
      `These set their own page container instead of using PAGE_WIDE / PAGE_NARROW / PAGE_CENTERED:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("gives loading states the same frame as the page they become", () => {
    // Nothing may move at the moment the data arrives.
    expect(PAGE_CENTERED).toContain("max-w-[1440px]");
    expect(PAGE_CENTERED).toContain(SHELL_PAD);
  });

  /* A flat p-8 is 32px of gutter on a 360px phone. The scale has to start
   * smaller and step up. */
  it("starts the padding scale small enough for a phone", () => {
    expect(SHELL_PAD.startsWith("p-4 ")).toBe(true);
    expect(SHELL_PAD).toMatch(/sm:p-\d/);
    expect(SHELL_PAD).toMatch(/md:p-\d/);
  });
});
