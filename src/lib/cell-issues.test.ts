import { describe, it, expect } from "vitest";
import { profileDataset } from "./profile";
import {
  buildCellIssues,
  cellRef,
  columnLetter,
  duplicateRowIndexes,
  sheetNameOf,
} from "./cell-issues";
import type { Row } from "./types";

const EN_DASH_MOJI = "â€“";

function build(name: string, columns: string[], rows: Row[]) {
  return profileDataset({
    id: "ds_test",
    name,
    columns,
    rows,
    createdAt: 0,
    changelog: [],
  });
}

/** A small file carrying one of every problem, at known coordinates. */
function messyDataset() {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i++) {
    rows.push({
      region: i === 3 ? "  North  " : i === 7 ? "north" : "North",
      product: i === 5 ? `Widget${EN_DASH_MOJI}Pro` : "Widget Pro",
      revenue: i === 11 ? 990_000 : 100 + i,
      note: i === 9 ? null : `note ${i}`,
    });
  }
  return build("sales.xlsx (Q3 Data)", ["region", "product", "revenue", "note"], rows);
}

describe("columnLetter / cellRef", () => {
  it("maps indexes onto spreadsheet column letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(2)).toBe("C");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(52)).toBe("BA");
  });

  it("counts the header as row 1, so the first data row is row 2", () => {
    expect(cellRef(0, 0)).toBe("A2");
    expect(cellRef(2, 14)).toBe("C16");
  });
});

describe("sheetNameOf", () => {
  it("recovers the worksheet the Excel importer recorded", () => {
    expect(sheetNameOf("sales.xlsx (Q3 Data)")).toBe("Q3 Data");
  });

  it("is null for a file that carried no worksheet", () => {
    expect(sheetNameOf("sales.csv")).toBeNull();
  });
});

describe("buildCellIssues", () => {
  it("pinpoints a missing value at its exact cell", () => {
    const ds = messyDataset();
    const report = buildCellIssues(ds, { rule: "missing" });

    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.column).toBe("note");
    expect(issue.rowIndex).toBe(9);
    expect(issue.row).toBe(11);
    expect(issue.ref).toBe("D11");
    expect(issue.sheet).toBe("Q3 Data");
    expect(issue.fix?.op).toEqual({ kind: "fillMissing", column: "note", strategy: "mode" });
  });

  it("locates stray whitespace and proposes the trimmed value", () => {
    const ds = messyDataset();
    const issue = buildCellIssues(ds, { rule: "whitespace" }).issues[0];

    expect(issue.ref).toBe("A5");
    expect(issue.value).toBe("  North  ");
    expect(issue.proposed).toBe("North");
  });

  it("locates broken encoding on the offending cell only", () => {
    const ds = messyDataset();
    const report = buildCellIssues(ds, { rule: "encoding" });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].ref).toBe("B7");
    expect(report.issues[0].diagnosticId).toBe("diag_encoding");
  });

  it("flags an outlier with the fence it would be capped to", () => {
    const ds = messyDataset();
    const issue = buildCellIssues(ds, { rule: "outlier" }).issues[0];

    expect(issue.column).toBe("revenue");
    expect(issue.value).toBe(990_000);
    expect(issue.rowIndex).toBe(11);
    expect(typeof issue.proposed).toBe("number");
    expect(issue.proposed as number).toBeLessThan(990_000);
    // Capping an extreme value is the analyst's call, never a bulk action.
    expect(issue.manual).toBe(true);
  });

  it("reports a type mismatch where a value fails its column type", () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      amount: i === 4 ? "not a number" : i * 10,
    }));
    const ds = build("mixed.csv", ["amount"], rows);

    const report = buildCellIssues(ds, { rule: "typeMismatch" });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].ref).toBe("A6");
    expect(report.issues[0].detail).toContain("not a number");
  });

  it("counts every issue even when the returned list is capped", () => {
    const rows: Row[] = Array.from({ length: 60 }, () => ({ a: "  padded  " }));
    const ds = build("wide.csv", ["a"], rows);

    const report = buildCellIssues(ds, { rule: "whitespace", limit: 10 });
    expect(report.issues).toHaveLength(10);
    expect(report.total).toBe(60);
    expect(report.countsByRule.whitespace).toBe(60);
    expect(report.truncated).toBe(true);
  });

  it("omits issues whose rule the analyst marked intentional", () => {
    const ds = messyDataset();
    const before = buildCellIssues(ds);
    const after = buildCellIssues(ds, { skipped: ["whitespace"] });

    expect(before.countsByRule.whitespace).toBeGreaterThan(0);
    expect(after.countsByRule.whitespace).toBe(0);
    expect(after.total).toBeLessThan(before.total);
  });

  it("omits issues whose parent finding was skipped by id", () => {
    const ds = messyDataset();
    const after = buildCellIssues(ds, { skipped: ["diag_encoding"] });
    expect(after.countsByRule.encoding).toBe(0);
  });

  it("narrows the scan to a single column when asked", () => {
    const ds = messyDataset();
    const report = buildCellIssues(ds, { column: "revenue" });
    expect(report.issues.every((i) => i.column === "revenue")).toBe(true);
  });

  it("returns issues in sheet reading order, down the rows", () => {
    const ds = messyDataset();
    const rows = buildCellIssues(ds).issues.map((i) => i.rowIndex);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it("does not report a second problem on a cell that is simply empty", () => {
    const rows: Row[] = Array.from({ length: 10 }, (_, i) => ({ label: i === 2 ? "   " : "Ok" }));
    const ds = build("blank.csv", ["label"], rows);

    const forRow2 = buildCellIssues(ds).issues.filter((i) => i.rowIndex === 2);
    expect(forRow2).toHaveLength(1);
    expect(forRow2[0].rule).toBe("missing");
  });
});

describe("duplicateRowIndexes", () => {
  it("returns the later copy of each exact repeat", () => {
    const rows: Row[] = [{ a: 1 }, { a: 2 }, { a: 1 }, { a: 3 }, { a: 1 }];
    expect(duplicateRowIndexes(rows)).toEqual([2, 4]);
  });

  it("is empty when every row is distinct", () => {
    expect(duplicateRowIndexes([{ a: 1 }, { a: 2 }])).toEqual([]);
  });
});
