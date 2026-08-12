/* Stacking order, enforced.
 *
 * Four modal overlays had grown across three different z-indexes, one of them
 * tied with the sticky top navbar. Nothing looked broken because DOM order
 * happened to break every tie the right way, which is the most expensive kind
 * of correct: the next overlay someone adds inherits none of that luck.
 *
 * This test does not check that the app looks right. It checks that the scale
 * is still a scale, and that nobody has gone back to picking a z-index on
 * their own. */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  Z_TABLE_HEADER,
  Z_SECTION_NAV,
  Z_NAVBAR,
  Z_POPOVER,
  Z_MODAL,
  Z_TOAST,
  MODAL_BACKDROP,
} from "../components/layout/layers";

const SRC = join(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

const value = (token: string): number => Number(token.replace(/^z-\[?|\]?$/g, ""));

describe("the layer scale", () => {
  it("runs strictly upward from table header to toast", () => {
    const order = [Z_TABLE_HEADER, Z_SECTION_NAV, Z_NAVBAR, Z_POPOVER, Z_MODAL, Z_TOAST].map(value);
    for (let i = 1; i < order.length; i++) {
      expect(order[i], `${order[i]} does not sit above ${order[i - 1]}`).toBeGreaterThan(
        order[i - 1]
      );
    }
  });

  /* The specific bug: a modal must cover the navbar, and the old z-50 modals
   * tied with the old z-50 navbar. */
  it("puts every modal above the application chrome", () => {
    expect(value(Z_MODAL)).toBeGreaterThan(value(Z_NAVBAR));
    expect(value(Z_MODAL)).toBeGreaterThan(value(Z_POPOVER));
  });

  it("keeps a toast readable over an open modal", () => {
    expect(value(Z_TOAST)).toBeGreaterThan(value(Z_MODAL));
  });

  it("builds the shared backdrop on the modal layer", () => {
    expect(MODAL_BACKDROP).toContain(Z_MODAL);
    expect(MODAL_BACKDROP).toContain("fixed inset-0");
  });
});

describe("nobody picks their own z-index", () => {
  const files = sourceFiles(SRC).filter((f) => !/layers\.ts$/.test(f));

  it("finds components to check", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  /* Arbitrary bracket values are the tell: z-[60] and z-[70] were how the
   * overlays escaped each other instead of agreeing on an order. */
  it("uses no arbitrary bracket z-index anywhere", () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\bz-\[\d+\]/.test(line)) {
            offenders.push(`${file.replace(SRC, "src")}:${i + 1}  ${line.trim().slice(0, 80)}`);
          }
        });
    }
    expect(
      offenders,
      `Use the constants in components/layout/layers.ts instead:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("has every full-screen overlay on the shared backdrop", () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // A fixed inset-0 element that sets its own z- is an overlay that
          // opted out of MODAL_BACKDROP.
          if (/fixed inset-0/.test(line) && /\bz-\d/.test(line)) {
            offenders.push(`${file.replace(SRC, "src")}:${i + 1}  ${line.trim().slice(0, 80)}`);
          }
        });
    }
    expect(
      offenders,
      `These overlays should use MODAL_BACKDROP:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
