/* Turning a page of text back into a table.
 *
 * The bug that motivated this module: the old parser dropped empty cells while
 * splitting, so a row with a blank Quantity silently shifted Revenue one column
 * to the left and every number after it landed under the wrong heading. A
 * misaligned table is worse than no table, because it still looks like data.
 *
 * The other half is that a PDF is not a table. It is a heading, a paragraph,
 * a table, a footnote, and a page number, and only one of those is a dataset.
 * Extraction has to find where the table starts and stops rather than treating
 * the whole page as one grid. */

import { describe, it, expect } from "vitest";
import { extractTables, parseNumericCell } from "./table-extract";

const table = [
  "Product      Quantity    Revenue",
  "Product A          20     50,000",
  "Product B          15     38,000",
  "Product C          42    112,500",
].join("\n");

describe("parseNumericCell", () => {
  it("reads a plain integer and a decimal", () => {
    expect(parseNumericCell("42")).toBe(42);
    expect(parseNumericCell("3.5")).toBe(3.5);
  });

  /* The example in the spec is "50,000". The old parser handed that to
   * Number(), got NaN, and stored the string. */
  it("reads thousands separators", () => {
    expect(parseNumericCell("50,000")).toBe(50000);
    expect(parseNumericCell("1,234,567")).toBe(1234567);
  });

  it("reads currency", () => {
    expect(parseNumericCell("$1,200.50")).toBe(1200.5);
    expect(parseNumericCell("£99")).toBe(99);
    expect(parseNumericCell("₦250,000")).toBe(250000);
  });

  it("reads accounting negatives in parentheses", () => {
    expect(parseNumericCell("(1,500)")).toBe(-1500);
    expect(parseNumericCell("(42)")).toBe(-42);
  });

  it("reads a percentage as its numeric part", () => {
    expect(parseNumericCell("12.5%")).toBe(12.5);
  });

  it("refuses text, blanks, and things that merely contain digits", () => {
    expect(parseNumericCell("Product A")).toBeNull();
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell("   ")).toBeNull();
    expect(parseNumericCell("Q1 2026 report")).toBeNull();
    expect(parseNumericCell("-")).toBeNull();
  });

  it("does not mistake a date for a number", () => {
    expect(parseNumericCell("2026-01-15")).toBeNull();
    expect(parseNumericCell("15/01/2026")).toBeNull();
  });
});

describe("extractTables", () => {
  it("returns nothing for prose", () => {
    const result = extractTables(
      "This is a paragraph of ordinary text.\nIt continues here with more words."
    );
    expect(result.tables).toEqual([]);
  });

  it("returns nothing for an empty document", () => {
    expect(extractTables("").tables).toEqual([]);
  });

  describe("a clean space-aligned table", () => {
    const result = extractTables(table);

    it("finds exactly one table", () => {
      expect(result.tables).toHaveLength(1);
    });

    it("reads the headers", () => {
      expect(result.tables[0].columns).toEqual(["Product", "Quantity", "Revenue"]);
      expect(result.tables[0].hasHeader).toBe(true);
    });

    it("reads every data row and no header row", () => {
      expect(result.tables[0].rows).toHaveLength(3);
      expect(result.tables[0].rows[0]).toEqual({
        Product: "Product A",
        Quantity: 20,
        Revenue: 50000,
      });
    });

    it("types the numeric columns as numeric", () => {
      expect(result.tables[0].columnTypes).toEqual(["text", "number", "number"]);
    });
  });

  it("handles pipe-delimited markdown-style tables", () => {
    const md = [
      "| Product   | Quantity | Revenue |",
      "| --------- | -------: | ------: |",
      "| Product A |       20 |  50,000 |",
      "| Product B |       15 |  38,000 |",
    ].join("\n");
    const result = extractTables(md);
    expect(result.tables[0].columns).toEqual(["Product", "Quantity", "Revenue"]);
    expect(result.tables[0].rows).toHaveLength(2);
    // The ---- separator row is formatting, not data.
    expect(result.tables[0].rows[0].Revenue).toBe(50000);
  });

  it("handles tab-delimited text", () => {
    const tsv = "Name\tScore\nAda\t99\nGrace\t97";
    const result = extractTables(tsv);
    expect(result.tables[0].columns).toEqual(["Name", "Score"]);
    expect(result.tables[0].rows).toEqual([
      { Name: "Ada", Score: 99 },
      { Name: "Grace", Score: 97 },
    ]);
  });

  /* The bug this module exists for. */
  describe("empty cells", () => {
    const withGap = [
      "Product   | Quantity | Revenue",
      "Product A |       20 |  50,000",
      "Product B |          |  38,000",
      "Product C |       42 | 112,500",
    ].join("\n");

    it("keeps a blank cell blank instead of shifting the row", () => {
      const rows = extractTables(withGap).tables[0].rows;
      expect(rows[1].Product).toBe("Product B");
      expect(rows[1].Quantity).toBeNull();
      // The number after the gap must still be under Revenue.
      expect(rows[1].Revenue).toBe(38000);
    });

    it("leaves the rows either side untouched", () => {
      const rows = extractTables(withGap).tables[0].rows;
      expect(rows[0].Revenue).toBe(50000);
      expect(rows[2].Revenue).toBe(112500);
    });
  });

  describe("boundaries", () => {
    const page = [
      "QUARTERLY SALES REPORT",
      "Prepared by the finance team for internal circulation only.",
      "",
      "Product      Quantity    Revenue",
      "Product A          20     50,000",
      "Product B          15     38,000",
      "",
      "All figures are provisional and subject to audit.",
    ].join("\n");

    it("finds the table and not the prose around it", () => {
      const result = extractTables(page);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rows).toHaveLength(2);
      expect(result.tables[0].columns).toEqual(["Product", "Quantity", "Revenue"]);
    });

    it("hands back the surrounding prose as text", () => {
      const result = extractTables(page);
      expect(result.text).toContain("QUARTERLY SALES REPORT");
      expect(result.text).toContain("subject to audit");
      expect(result.text).not.toContain("Product A");
    });

    it("records where the table sat in the document", () => {
      const t = extractTables(page).tables[0];
      expect(t.startLine).toBeGreaterThan(0);
      expect(t.endLine).toBeGreaterThan(t.startLine);
    });
  });

  it("finds two separate tables split by prose", () => {
    const doc = [
      "Region    Revenue",
      "EMEA       50,000",
      "APAC       38,000",
      "",
      "The following table shows headcount.",
      "",
      "Team       People",
      "Sales          12",
      "Support         8",
    ].join("\n");
    const result = extractTables(doc);
    expect(result.tables).toHaveLength(2);
    expect(result.tables[0].columns).toEqual(["Region", "Revenue"]);
    expect(result.tables[1].columns).toEqual(["Team", "People"]);
  });

  describe("multi-page tables", () => {
    it("drops a header that repeats partway through", () => {
      const doc = [
        "Product      Quantity    Revenue",
        "Product A          20     50,000",
        "Product B          15     38,000",
        "Product      Quantity    Revenue",
        "Product C          42    112,500",
      ].join("\n");
      const t = extractTables(doc).tables[0];
      expect(t.repeatedHeadersDropped).toBe(1);
      expect(t.rows).toHaveLength(3);
      expect(t.rows.map((r) => r.Product)).toEqual(["Product A", "Product B", "Product C"]);
    });
  });

  describe("header detection", () => {
    it("treats an all-text first row over numeric rows as a header", () => {
      const t = extractTables(table).tables[0];
      expect(t.hasHeader).toBe(true);
    });

    it("invents column names when the first row is already data", () => {
      const doc = ["Ada      99", "Grace    97", "Alan     95"].join("\n");
      const t = extractTables(doc).tables[0];
      expect(t.hasHeader).toBe(false);
      expect(t.columns).toEqual(["column_1", "column_2"]);
      expect(t.rows).toHaveLength(3);
    });

    it("never produces a duplicate column name", () => {
      const doc = ["Name  Name  Name", "a     b     c", "d     e     f"].join("\n");
      const t = extractTables(doc).tables[0];
      expect(new Set(t.columns).size).toBe(t.columns.length);
    });

    it("names an unlabelled column rather than leaving it blank", () => {
      const doc = ["Product |  | Revenue", "A       | x | 10", "B       | y | 20"].join("\n");
      const t = extractTables(doc).tables[0];
      expect(t.columns.every((c) => c.trim().length > 0)).toBe(true);
    });
  });

  describe("confidence", () => {
    it("is high for a clean consistent table", () => {
      expect(extractTables(table).tables[0].confidence).toBeGreaterThan(0.7);
    });

    /* One row losing a cell is what OCR does to a real table, so it stays a
     * table and the confidence carries the doubt. Text that is ragged all the
     * way through is not a table at all, which the block finder handles by
     * never forming a block. */
    it("is lower when a row loses a cell", () => {
      const ragged = ["A    B    C", "1    2    3", "4    5", "6    7    8", "9    10   11"].join(
        "\n"
      );
      const found = extractTables(ragged).tables[0];
      expect(found).toBeDefined();
      expect(found.confidence).toBeLessThan(extractTables(table).tables[0].confidence);
    });

    it("forms no table at all from text that is ragged throughout", () => {
      const noise = ["A  B  C", "1  2", "3  4  5  6", "7", "8  9  10  11  12"].join("\n");
      expect(extractTables(noise).tables).toHaveLength(0);
    });
  });

  describe("robustness", () => {
    it("ignores a two-line block, which is a heading and not a table", () => {
      expect(extractTables("Title  Here\nSub    Line").tables).toHaveLength(0);
    });

    it("survives a single very long line", () => {
      expect(() => extractTables("x".repeat(50_000))).not.toThrow();
    });

    it("survives ragged OCR noise without throwing", () => {
      const noise = Array.from({ length: 60 }, (_, i) => `${i} |  ${i % 3} | `).join("\n");
      expect(() => extractTables(noise)).not.toThrow();
    });
  });
});
