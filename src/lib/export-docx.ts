/* Word export. `docx` is loaded on demand so its weight never lands in the
 * initial bundle: most sessions never export a report. */

import type { FileChild } from "docx";
import type { Report, ReportSection } from "./report";

/** Build a real .docx (not HTML renamed). Separated from the download so the
 *  document itself can be generated and inspected outside a browser. */
export async function buildDocxBlob(report: Report): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
  } = await import("docx");

  const border = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  // Paragraphs and tables are both FileChild, which is what a section takes.
  const children: FileChild[] = [];

  children.push(
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${report.generatedAt.slice(0, 10)} from ${report.datasetName}. Compiled locally by Nexora.`,
          italics: true,
          size: 18,
          color: "666666",
        }),
      ],
      spacing: { after: 240 },
    })
  );

  for (const section of report.sections) {
    if (!section.include) continue;
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 120 },
      })
    );

    if (section.body.trim()) {
      children.push(new Paragraph({ text: section.body.trim(), spacing: { after: 160 } }));
    }

    (section.bullets ?? []).forEach((bullet, i) => {
      children.push(
        section.ordered
          ? // Numbered inline rather than through a numbering definition: the
            // order is fixed at export time and never needs to renumber.
            new Paragraph({
              text: `${i + 1}. ${bullet}`,
              indent: { left: 360 },
              spacing: { after: 60 },
            })
          : new Paragraph({ text: bullet, bullet: { level: 0 }, spacing: { after: 60 } })
      );
    });

    if (section.table && section.table.rows.length > 0) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: section.table.headers.map(
                (header) =>
                  new TableCell({
                    borders: cellBorders,
                    shading: { fill: "F2F2F2" },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: header, bold: true, size: 18 })] }),
                    ],
                  })
              ),
            }),
            ...section.table.rows.map(
              (row) =>
                new TableRow({
                  children: row.map(
                    (cell) =>
                      new TableCell({
                        borders: cellBorders,
                        children: [
                          new Paragraph({ children: [new TextRun({ text: cell, size: 18 })] }),
                        ],
                      })
                  ),
                })
            ),
          ],
        })
      );
      children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    }
  }

  const doc = new Document({
    creator: "Nexora",
    title: report.title,
    description: `Analysis report for ${report.datasetName}`,
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}

export async function downloadDocx(report: Report, filename: string): Promise<void> {
  triggerDownload(await buildDocxBlob(report), filename);
}

/** Count what a Word export would contain, used to label the button honestly. */
export function docxOutline(sections: ReportSection[]): { sections: number; tables: number } {
  const included = sections.filter((s) => s.include);
  return {
    sections: included.length,
    tables: included.filter((s) => s.table && s.table.rows.length > 0).length,
  };
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
