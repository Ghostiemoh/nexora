/* A minimal PDF writer.
 *
 * Nexora exports dashboards as pictures with captions, which is the one PDF
 * shape you can build honestly without a typesetting engine: a page box, a
 * JPEG placed inside it, and a few lines of Helvetica. JPEG rides straight
 * through as a DCTDecode stream, so no re-encoding happens and no dependency
 * is needed.
 *
 * The Reports page keeps using the browser's print dialog, which is right for
 * flowing text. This is for the visual deliverable.
 *
 * Everything here is byte assembly over plain data, so the structure can be
 * built and checked without a browser. */

const encoder = new TextEncoder();

/** A4 landscape in points, the shape a dashboard actually fits. */
export const PAGE_LANDSCAPE = { width: 842, height: 595 };
export const PAGE_PORTRAIT = { width: 595, height: 842 };

const MARGIN = 36;
/* The application surface, so an exported page looks like the product. */
const BACKGROUND = { r: 0.063, g: 0.075, b: 0.082 };

export interface PdfImage {
  /** raw JPEG bytes; they are embedded verbatim */
  jpeg: Uint8Array;
  /** pixel dimensions, used to preserve the aspect ratio on the page */
  width: number;
  height: number;
}

export interface PdfPage {
  title?: string;
  /** one line under the title */
  subtitle?: string;
  image?: PdfImage;
  /** body lines, laid out under the image (or filling the page without one) */
  lines?: string[];
  /** small line pinned to the bottom of the page */
  footer?: string;
}

export interface PdfDocument {
  title: string;
  pages: PdfPage[];
  orientation?: "landscape" | "portrait";
}

/** Collects bytes while tracking how many have been written, which is what an
 *  xref table needs and what a string builder cannot give you. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  private size = 0;

  get length(): number {
    return this.size;
  }

  push(data: string | Uint8Array): void {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    this.chunks.push(bytes);
    this.size += bytes.length;
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}

/** PDF literal strings escape their own delimiters. Text is also folded to
 *  WinAnsi's ASCII range, since no font is embedded to carry anything wider. */
export function escapePdfText(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Fit a picture inside a box without distorting it. */
export function fitInside(
  image: { width: number; height: number },
  box: { width: number; height: number }
): { width: number; height: number } {
  const scale = Math.min(box.width / image.width, box.height / image.height, 1_000);
  return { width: image.width * scale, height: image.height * scale };
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/** Build the drawing instructions for one page. */
function pageContent(
  page: PdfPage,
  size: { width: number; height: number },
  imageName: string | null,
  placed: { width: number; height: number; x: number; y: number } | null
): string {
  const ops: string[] = [
    `${num(BACKGROUND.r)} ${num(BACKGROUND.g)} ${num(BACKGROUND.b)} rg`,
    `0 0 ${size.width} ${size.height} re f`,
  ];

  let cursor = size.height - MARGIN - 6;

  if (page.title) {
    ops.push(
      "0.945 0.949 0.929 rg",
      "BT /F2 16 Tf",
      `${MARGIN} ${num(cursor)} Td (${escapePdfText(page.title)}) Tj ET`
    );
    cursor -= 20;
  }

  if (page.subtitle) {
    ops.push(
      "0.718 0.749 0.729 rg",
      "BT /F1 10 Tf",
      `${MARGIN} ${num(cursor)} Td (${escapePdfText(page.subtitle)}) Tj ET`
    );
    cursor -= 18;
  }

  if (imageName && placed) {
    ops.push(
      "q",
      `${num(placed.width)} 0 0 ${num(placed.height)} ${num(placed.x)} ${num(placed.y)} cm`,
      `/${imageName} Do`,
      "Q"
    );
    cursor = placed.y - 18;
  }

  for (const line of page.lines ?? []) {
    if (cursor < MARGIN + 24) break;
    ops.push(
      "0.718 0.749 0.729 rg",
      "BT /F1 10 Tf",
      `${MARGIN} ${num(cursor)} Td (${escapePdfText(line)}) Tj ET`
    );
    cursor -= 14;
  }

  if (page.footer) {
    ops.push(
      "0.545 0.576 0.557 rg",
      "BT /F1 8 Tf",
      `${MARGIN} ${MARGIN - 12} Td (${escapePdfText(page.footer)}) Tj ET`
    );
  }

  return ops.join("\n");
}

/** Assemble a PDF. Object numbering: 1 catalog, 2 pages, 3 and 4 the two
 *  Helvetica faces, then each page's objects in order. */
export function buildPdf(doc: PdfDocument): Uint8Array {
  const size = doc.orientation === "portrait" ? PAGE_PORTRAIT : PAGE_LANDSCAPE;
  const pages = doc.pages.length > 0 ? doc.pages : [{ title: doc.title }];

  /* Objects are built body-first so page objects can reference content and
   * image objects by number before those numbers are laid down. */
  const bodies: (string | Uint8Array)[][] = [];
  let nextNumber = 5;
  const pageNumbers: number[] = [];

  interface Planned {
    pageNumber: number;
    contentNumber: number;
    imageNumber: number | null;
    page: PdfPage;
  }
  const planned: Planned[] = pages.map((page) => {
    const pageNumber = nextNumber++;
    const contentNumber = nextNumber++;
    const imageNumber = page.image ? nextNumber++ : null;
    pageNumbers.push(pageNumber);
    return { pageNumber, contentNumber, imageNumber, page };
  });

  // 1: catalog, 2: page tree, 3 and 4: fonts.
  bodies[1] = ["<< /Type /Catalog /Pages 2 0 R >>"];
  bodies[2] = [
    `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNumbers.length} >>`,
  ];
  bodies[3] = ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"];
  bodies[4] = [
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  for (const { pageNumber, contentNumber, imageNumber, page } of planned) {
    const box = {
      width: size.width - MARGIN * 2,
      height: size.height - MARGIN * 2 - (page.title ? 30 : 0) - (page.lines?.length ? 40 : 0),
    };
    const placed =
      page.image && imageNumber
        ? (() => {
            const fitted = fitInside(page.image, box);
            return {
              ...fitted,
              x: (size.width - fitted.width) / 2,
              // Sit under the heading block rather than centred in the whole page.
              y: size.height - MARGIN - (page.title ? 46 : 6) - fitted.height,
            };
          })()
        : null;

    const content = pageContent(page, size, imageNumber ? "Im0" : null, placed);
    const contentBytes = encoder.encode(content);

    const resources = [
      "/Font << /F1 3 0 R /F2 4 0 R >>",
      imageNumber ? `/XObject << /Im0 ${imageNumber} 0 R >>` : "",
    ]
      .filter(Boolean)
      .join(" ");

    bodies[pageNumber] = [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << ${resources} >> /Contents ${contentNumber} 0 R >>`,
    ];
    bodies[contentNumber] = [
      `<< /Length ${contentBytes.length} >>\nstream\n`,
      contentBytes,
      "\nendstream",
    ];

    if (page.image && imageNumber) {
      bodies[imageNumber] = [
        `<< /Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.jpeg.length} >>\nstream\n`,
        page.image.jpeg,
        "\nendstream",
      ];
    }
  }

  const writer = new ByteWriter();
  writer.push("%PDF-1.4\n");
  // A binary comment tells readers and transfer tools this file is not text.
  writer.push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const offsets: number[] = [];
  for (let number = 1; number < bodies.length; number++) {
    offsets[number] = writer.length;
    writer.push(`${number} 0 obj\n`);
    for (const part of bodies[number]) writer.push(part);
    writer.push("\nendobj\n");
  }

  const xrefOffset = writer.length;
  const count = bodies.length; // object 0 is the free-list head
  writer.push(`xref\n0 ${count}\n`);
  writer.push("0000000000 65535 f \n");
  for (let number = 1; number < count; number++) {
    writer.push(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  }
  writer.push(
    `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return writer.toBytes();
}

export function pdfToBlob(doc: PdfDocument): Blob {
  const bytes = buildPdf(doc);
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

/** Pixel dimensions declared in a JPEG's frame header. Needed because a PDF
 *  image object has to state its own size. */
export function readJpegSize(jpeg: Uint8Array): { width: number; height: number } | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let at = 2;
  while (at < jpeg.length - 9) {
    if (jpeg[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = jpeg[at + 1];
    // SOF0..SOF15, skipping the four that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: (jpeg[at + 5] << 8) | jpeg[at + 6],
        width: (jpeg[at + 7] << 8) | jpeg[at + 8],
      };
    }
    at += 2 + ((jpeg[at + 2] << 8) | jpeg[at + 3]);
  }
  return null;
}

/** Turn a rasterized chart into the image payload a PDF page takes. */
export async function blobToPdfImage(blob: Blob): Promise<PdfImage> {
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const size = readJpegSize(jpeg);
  if (!size) throw new Error("That image is not a JPEG, so it cannot be placed in the PDF.");
  return { jpeg, width: size.width, height: size.height };
}
