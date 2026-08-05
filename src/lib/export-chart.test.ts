import { describe, it, expect } from "vitest";
import {
  chartTitle,
  escapeXml,
  matrixToSvg,
  readSvgSize,
  seriesToCsv,
  seriesToTable,
  tableToCsv,
} from "./export-chart";
import type { ChartConfig, ChartSeries } from "./chart-recommend";

const barConfig: ChartConfig = { type: "bar", x: "region", y: "revenue", agg: "sum" };

const categorySeries: ChartSeries = {
  shape: "category",
  data: [
    { name: "West", value: 300 },
    { name: "East", value: 225 },
  ],
  filterColumn: "region",
};

describe("chartTitle", () => {
  it("names a chart by what it measures and how it splits", () => {
    expect(chartTitle(barConfig)).toBe("Revenue by Region");
  });

  it("names a cross-tab by both dimensions", () => {
    expect(chartTitle({ ...barConfig, type: "heatmap", series: "product" })).toBe(
      "Revenue by Region and Product"
    );
  });

  it("says what a count chart counts", () => {
    expect(chartTitle({ type: "bar", x: "region", y: null, agg: "count" })).toBe(
      "Record count by Region"
    );
  });
});

describe("seriesToTable", () => {
  it("turns a category series into label and value columns", () => {
    const table = seriesToTable(barConfig, categorySeries);

    expect(table.headers).toEqual(["region", "sum of revenue"]);
    expect(table.rows).toEqual([
      ["West", 300],
      ["East", 225],
    ]);
  });

  it("labels the measure column Count when the chart counts rows", () => {
    const table = seriesToTable({ type: "bar", x: "region", y: null, agg: "count" }, categorySeries);
    expect(table.headers[1]).toBe("Count");
  });

  it("turns a scatter series into two numeric columns", () => {
    const series: ChartSeries = {
      shape: "scatter",
      data: [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
      ],
      omitted: 0,
    };
    const table = seriesToTable({ type: "scatter", x: "units", y: "revenue", agg: "sum" }, series);

    expect(table.headers).toEqual(["units", "revenue"]);
    expect(table.rows).toEqual([
      [1, 10],
      [2, 20],
    ]);
  });

  it("flattens a heatmap into a real cross-tab", () => {
    const series: ChartSeries = {
      shape: "matrix",
      rows: ["West", "East"],
      cols: ["Q1", "Q2"],
      cells: [
        { row: "West", col: "Q1", value: 10 },
        { row: "West", col: "Q2", value: 20 },
        { row: "East", col: "Q1", value: 30 },
        { row: "East", col: "Q2", value: 40 },
      ],
      max: 40,
      min: 10,
    };
    const table = seriesToTable({ ...barConfig, type: "heatmap", series: "quarter" }, series);

    expect(table.headers).toEqual(["region", "Q1", "Q2"]);
    expect(table.rows).toEqual([
      ["West", 10, 20],
      ["East", 30, 40],
    ]);
  });

  it("fills a missing heatmap intersection with zero rather than dropping a column", () => {
    const series: ChartSeries = {
      shape: "matrix",
      rows: ["West"],
      cols: ["Q1", "Q2"],
      cells: [{ row: "West", col: "Q1", value: 10 }],
      max: 10,
      min: 0,
    };
    const table = seriesToTable({ ...barConfig, type: "heatmap", series: "quarter" }, series);
    expect(table.rows[0]).toEqual(["West", 10, 0]);
  });

  it("labels a histogram's bins as ranges", () => {
    const series: ChartSeries = {
      shape: "bins",
      data: [
        { name: "0 – 100", value: 12 },
        { name: "100 – 200", value: 8 },
      ],
    };
    const table = seriesToTable({ type: "histogram", x: "revenue", y: null, agg: "count" }, series);

    expect(table.headers).toEqual(["revenue range", "Rows"]);
    expect(table.rows[0]).toEqual(["0 – 100", 12]);
  });
});

describe("tableToCsv", () => {
  it("writes a header row followed by the data", () => {
    expect(seriesToCsv(barConfig, categorySeries)).toBe(
      "region,sum of revenue\nWest,300\nEast,225"
    );
  });

  it("quotes a value holding a comma, a quote, or a newline", () => {
    const csv = tableToCsv({
      headers: ["label", "value"],
      rows: [
        ["Lagos, NG", 1],
        ['He said "hi"', 2],
      ],
    });

    expect(csv).toContain('"Lagos, NG"');
    expect(csv).toContain('"He said ""hi"""');
  });
});

describe("escapeXml", () => {
  it("escapes every character that would break markup", () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
  });
});

describe("matrixToSvg", () => {
  const series: Extract<ChartSeries, { shape: "matrix" }> = {
    shape: "matrix",
    rows: ["West", "East"],
    cols: ["Q1", "Q2"],
    cells: [
      { row: "West", col: "Q1", value: 10 },
      { row: "West", col: "Q2", value: 20 },
      { row: "East", col: "Q1", value: 30 },
      { row: "East", col: "Q2", value: 40 },
    ],
    max: 40,
    min: 10,
  };

  it("renders a standalone SVG document", () => {
    const svg = matrixToSvg(series);
    expect(svg).toContain("<?xml");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("draws a rect per intersection plus the background", () => {
    const svg = matrixToSvg(series);
    expect(svg.match(/<rect/g)).toHaveLength(5);
  });

  it("labels every row and column", () => {
    const svg = matrixToSvg(series);
    for (const label of ["West", "East", "Q1", "Q2"]) {
      expect(svg).toContain(label);
    }
  });

  it("draws the title when one is given", () => {
    expect(matrixToSvg(series, { title: "Revenue by region" })).toContain("Revenue by region");
  });

  it("escapes a label that would otherwise break the markup", () => {
    const risky: Extract<ChartSeries, { shape: "matrix" }> = {
      ...series,
      rows: ["R&D <all>"],
      cells: [{ row: "R&D <all>", col: "Q1", value: 5 }],
    };
    const svg = matrixToSvg(risky);

    expect(svg).toContain("R&amp;D &lt;all&gt;");
    expect(svg).not.toContain("<all>");
  });

  it("survives a matrix where every value is identical", () => {
    const flat: Extract<ChartSeries, { shape: "matrix" }> = {
      ...series,
      cells: series.cells.map((c) => ({ ...c, value: 7 })),
      max: 7,
      min: 7,
    };
    expect(() => matrixToSvg(flat)).not.toThrow();
    expect(matrixToSvg(flat)).toContain("7");
  });
});

describe("readSvgSize", () => {
  it("reads the declared dimensions", () => {
    expect(readSvgSize('<svg width="640" height="360" viewBox="0 0 640 360">')).toEqual({
      width: 640,
      height: 360,
    });
  });

  it("rounds a fractional size", () => {
    expect(readSvgSize('<svg width="640.5" height="360.4">')).toEqual({ width: 641, height: 360 });
  });

  it("falls back to a sane size when the document declares none", () => {
    expect(readSvgSize("<svg>")).toEqual({ width: 640, height: 360 });
  });
});
