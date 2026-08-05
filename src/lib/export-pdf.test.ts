import { describe, it, expect } from "vitest";
import { buildPdf, escapePdfText, fitInside, readJpegSize } from "./export-pdf";

const decoder = new TextDecoder("latin1");

/** Read a PDF back the way a viewer does: find the xref, follow the offsets. */
function parsePdf(bytes: Uint8Array) {
  const text = decoder.decode(bytes);

  const startxref = /startxref\s+(\d+)\s+%%EOF/.exec(text);
  expect(startxref, "no startxref record").not.toBeNull();
  const xrefOffset = parseInt(startxref![1], 10);
  expect(text.slice(xrefOffset, xrefOffset + 4)).toBe("xref");

  const header = /xref\s+0 (\d+)\s/.exec(text.slice(xrefOffset));
  const count = parseInt(header![1], 10);

  // Entries are fixed-width: 20 bytes each, starting after "xref\n0 N\n".
  const entriesStart = xrefOffset + header![0].length;
  const offsets: number[] = [];
  for (let i = 1; i < count; i++) {
    const entry = text.slice(entriesStart + i * 20, entriesStart + i * 20 + 20);
    offsets.push(parseInt(entry.slice(0, 10), 10));
  }

  return { text, count, offsets };
}

describe("escapePdfText", () => {
  it("escapes the delimiters a literal string cannot contain", () => {
    expect(escapePdfText("Revenue (net) \\ 2026")).toBe("Revenue \\(net\\) \\\\ 2026");
  });

  it("folds typographic punctuation into the ASCII a base font can draw", () => {
    expect(escapePdfText("Q1–Q2 “growth” … it’s up")).toBe('Q1-Q2 "growth" ... it\'s up');
  });

  it("drops characters no WinAnsi base font could render", () => {
    expect(escapePdfText("Kano 🚀 report")).toBe("Kano  report");
  });
});

describe("fitInside", () => {
  it("scales a wide picture down to the box width", () => {
    expect(fitInside({ width: 1600, height: 900 }, { width: 800, height: 800 })).toEqual({
      width: 800,
      height: 450,
    });
  });

  it("scales a tall picture down to the box height", () => {
    expect(fitInside({ width: 400, height: 1000 }, { width: 800, height: 500 })).toEqual({
      width: 200,
      height: 500,
    });
  });

  it("never distorts the aspect ratio", () => {
    const fitted = fitInside({ width: 1200, height: 400 }, { width: 500, height: 500 });
    expect(fitted.width / fitted.height).toBeCloseTo(3, 6);
  });
});

describe("readJpegSize", () => {
  it("reads the dimensions out of a frame header", () => {
    // SOI, then an SOF0 segment declaring 320 x 200.
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x00, 0xc8, // height 200
      0x01, 0x40, // width 320
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(readJpegSize(jpeg)).toEqual({ width: 320, height: 200 });
  });

  it("skips segments that precede the frame header", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46, // APP0
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x02, 0x58, // height 600
      0x03, 0x20, // width 800
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(readJpegSize(jpeg)).toEqual({ width: 800, height: 600 });
  });

  it("returns null for bytes that are not a JPEG", () => {
    expect(readJpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe("buildPdf", () => {
  it("writes a header, a trailer, and a terminating marker", () => {
    const { text } = parsePdf(buildPdf({ title: "Report", pages: [{ title: "Page one" }] }));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("points every xref entry at the object it claims", () => {
    const bytes = buildPdf({
      title: "Dashboard",
      pages: [{ title: "Revenue" }, { title: "Regions" }],
    });
    const { text, offsets } = parsePdf(bytes);

    offsets.forEach((offset, i) => {
      expect(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} is misplaced`).toBe(
        true
      );
    });
  });

  it("declares one page object per page and counts them in the tree", () => {
    const bytes = buildPdf({
      title: "Dashboard",
      pages: [{ title: "A" }, { title: "B" }, { title: "C" }],
    });
    const { text } = parsePdf(bytes);

    expect(text).toContain("/Count 3");
    expect(text.match(/\/Type \/Page[^s]/g)).toHaveLength(3);
  });

  it("embeds JPEG bytes verbatim as a DCTDecode stream", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x41, 0x42, 0x43, 0xff, 0xd9]);
    const bytes = buildPdf({
      title: "Chart",
      pages: [{ title: "Revenue", image: { jpeg, width: 800, height: 450 } }],
    });
    const { text } = parsePdf(bytes);

    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Width 800");
    expect(text).toContain(`/Length ${jpeg.length}`);
    // The payload survives the trip unaltered.
    expect(text).toContain("ABC");
  });

  it("references the image from the page that draws it", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const { text } = parsePdf(
      buildPdf({ title: "Chart", pages: [{ title: "X", image: { jpeg, width: 10, height: 10 } }] })
    );

    expect(text).toContain("/XObject << /Im0");
    expect(text).toContain("/Im0 Do");
  });

  it("omits an XObject resource on a page with no picture", () => {
    const { text } = parsePdf(buildPdf({ title: "Text", pages: [{ lines: ["one", "two"] }] }));
    expect(text).not.toContain("/XObject");
    expect(text).toContain("(one) Tj");
  });

  it("writes both Helvetica faces so titles can be bold", () => {
    const { text } = parsePdf(buildPdf({ title: "T", pages: [{ title: "Heading" }] }));
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("/BaseFont /Helvetica-Bold");
  });

  it("uses a landscape media box by default and portrait on request", () => {
    const landscape = parsePdf(buildPdf({ title: "T", pages: [{}] })).text;
    const portrait = parsePdf(
      buildPdf({ title: "T", pages: [{}], orientation: "portrait" })
    ).text;

    expect(landscape).toContain("/MediaBox [0 0 842 595]");
    expect(portrait).toContain("/MediaBox [0 0 595 842]");
  });

  it("always produces at least one page", () => {
    const { text } = parsePdf(buildPdf({ title: "Empty", pages: [] }));
    expect(text).toContain("/Count 1");
  });

  it("escapes a title containing parentheses rather than breaking the stream", () => {
    const { text } = parsePdf(
      buildPdf({ title: "T", pages: [{ title: "Revenue (net) by region" }] })
    );
    expect(text).toContain("(Revenue \\(net\\) by region) Tj");
  });
});
