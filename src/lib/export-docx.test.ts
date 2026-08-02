import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import { buildDashboard } from "./auto-dashboard";
import { analyze } from "./insights";
import { buildReport } from "./report";
import { buildDocxBlob, docxOutline } from "./export-docx";
import type { Row } from "./types";

const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({
  date: `2024-${String(1 + (i % 12)).padStart(2, "0")}-15`,
  region: ["North", "South", "East", "West"][i % 4],
  revenue: 100 + i * 25,
}));

const ds = profileDataset({
  id: "t",
  name: "sales.csv",
  columns: ["date", "region", "revenue"],
  rows,
  createdAt: 0,
  changelog: [],
});

const report = buildReport(ds, analyze(ds), buildDashboard(ds), "2026-08-02T09:00:00.000Z");

describe("buildDocxBlob", () => {
  it("produces a real Office Open XML package, not renamed HTML", async () => {
    const bytes = new Uint8Array(await (await buildDocxBlob(report)).arrayBuffer());

    // Every .docx is a zip: it must start with the local file header magic.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("word/document.xml");
    expect(text).toContain("[Content_Types].xml");
  });

  it("writes a document large enough to hold every section", async () => {
    expect((await buildDocxBlob(report)).size).toBeGreaterThan(4000);
  });

  it("shrinks when sections are excluded", async () => {
    const full = (await buildDocxBlob(report)).size;
    const trimmed = {
      ...report,
      sections: report.sections.map((s) => ({ ...s, include: s.id === "conclusion" })),
    };
    expect((await buildDocxBlob(trimmed)).size).toBeLessThan(full);
  });

  it("survives a report whose sections are all empty", async () => {
    const bare = {
      ...report,
      sections: report.sections.map((s) => ({
        ...s,
        body: "",
        bullets: undefined,
        table: undefined,
      })),
    };
    await expect(buildDocxBlob(bare)).resolves.toBeInstanceOf(Blob);
  });
});

describe("docxOutline", () => {
  it("counts only what the export will contain", () => {
    const outline = docxOutline(report.sections);
    expect(outline.sections).toBe(10);
    expect(outline.tables).toBeGreaterThan(0);

    const hidden = report.sections.map((s) => ({ ...s, include: false }));
    expect(docxOutline(hidden)).toEqual({ sections: 0, tables: 0 });
  });
});
