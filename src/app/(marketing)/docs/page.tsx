import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, Section, Bullets, Facts } from "@/components/marketing/prose-page";

export const metadata: Metadata = {
  title: "Documentation · Nexora",
  description:
    "How Nexora works: supported formats, the three-step workflow, every tool, limits, and the AI setup.",
};

export default function DocsPage() {
  return (
    <ProsePage
      eyebrow="Documentation"
      title="Everything Nexora does, and how"
      intro="Nexora is an analytics workspace that runs inside your browser tab. This page covers the workflow, each tool, the limits, and the few cases where anything leaves your machine."
      updated="4 August 2026"
    >
      <Section title="Quick start">
        <p>
          Open the workspace, choose a dataset, and work through the three steps. Nothing installs
          and no account is created.
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-white">Load.</strong> Drop a CSV, TSV, JSON, or Excel file on
              the <Link href="/launch" className="text-primary hover:underline">Datasets</Link>{" "}
              screen, or load the built-in sample to look around first.
            </>,
            <>
              <strong className="text-white">Fix.</strong>{" "}
              <Link href="/dataset-doctor" className="text-primary hover:underline">Dataset Doctor</Link>{" "}
              profiles the file on load and lists every defect with the fix that repairs it.
            </>,
            <>
              <strong className="text-white">Read.</strong> The{" "}
              <Link href="/dashboard" className="text-primary hover:underline">Dashboard</Link>{" "}
              builds itself from your columns: KPIs, trends, breakdowns, filters.
            </>,
            <>
              <strong className="text-white">Write.</strong>{" "}
              <Link href="/reports" className="text-primary hover:underline">Reports</Link> turns the
              findings into an editable document and exports it.
            </>,
          ]}
        />
      </Section>

      <Section title="Supported sources">
        <Facts
          rows={[
            { term: "CSV, TSV, TXT", detail: "Delimiter is sniffed. Quoted fields, embedded newlines, and BOM headers are handled." },
            { term: "Excel (.xlsx)", detail: "You pick the worksheet. Excel serial dates are detected and can be converted to real dates." },
            { term: "JSON", detail: "An array of records, or a single object. Nested keys are flattened up to three levels deep." },
            { term: "PostgreSQL, MySQL", detail: "Read-only connections. Only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN are permitted, one statement per request." },
            { term: "Scans and PDFs", detail: "OCR Center extracts text into an editable grid you can import as a dataset." },
          ]}
        />
      </Section>

      <Section title="Limits">
        <Facts
          rows={[
            { term: "File size", detail: "25 MB per file." },
            { term: "Rows", detail: "50,000 per dataset. Past that, parsing stops and the workspace tells you it truncated." },
            { term: "Storage", detail: "Datasets live in this browser's local storage. Anything over roughly 3.5 MB stays in memory for the session only." },
            { term: "Undo depth", detail: "Ten cleaning operations per dataset, for the current session." },
            { term: "Scatter points", detail: "2,000 plotted; anything beyond is reported as omitted rather than silently dropped." },
          ]}
        />
      </Section>

      <Section title="Dataset Doctor">
        <p>
          Every file is profiled the moment it lands: column types, completeness, uniqueness,
          quartiles, outlier fences, date ranges, and value frequencies. From that profile it scores
          four dimensions.
        </p>
        <Bullets
          items={[
            <><strong className="text-white">Completeness</strong> — the share of cells that hold a value.</>,
            <><strong className="text-white">Accuracy</strong> — numeric values inside the 1.5×IQR fences.</>,
            <><strong className="text-white">Validity</strong> — cells that match the type inferred for their column.</>,
            <><strong className="text-white">Consistency</strong> — whitespace, casing, encoding, and duplicate rows.</>,
          ]}
        />
        <p>
          Each finding carries a fix, and each fix previews its blast radius before you apply it, so
          you know how many cells or rows it will touch. Everything is undoable and is recorded in
          the audit log. The sequence of fixes can be saved as a recipe and replayed on another file.
        </p>
      </Section>

      <Section title="Dashboard">
        <p>
          The dashboard reads what your columns mean, not only what type they hold. A column called
          revenue is treated as money; a column called latency is not. From that reading it builds
          the KPIs the data can actually support, and omits the ones it cannot.
        </p>
        <Bullets
          items={[
            "KPIs adapt to the dataset: total revenue, gross profit, margin, order count, distinct customers, average order value, units, conversion rate, inventory value. A dataset with no business vocabulary still gets meaningful totals and averages.",
            "Where a date column exists, each KPI is compared against the preceding window of equal length, so a half-finished month never reads as a collapse.",
            "Every chart carries its own type switcher. The generated type is a starting point: bar, line, pie, area, scatter, histogram, doughnut, and heatmap are offered whenever the columns allow them, and disabled with a reason when they do not.",
            "Filter the whole page from the filter bar, or click any bar or slice to cross-filter every other panel and KPI.",
          ]}
        />
      </Section>

      <Section title="Reports">
        <p>
          The report is written from the analysis, not from a template with your numbers dropped in.
          It contains an executive summary, data quality, KPIs, trends, findings with evidence, root
          causes, and recommendations. Every section can be edited or excluded before export.
        </p>
        <p>
          Report exports: PDF via your browser&apos;s print dialog, Word (.docx), Markdown, cleaned
          CSV, and Excel. Each export is logged in History and can be downloaded again later.
        </p>
        <p>
          Dashboard exports are separate and cover both directions. A picture: PNG, SVG, or a PDF
          with a page per chart. The numbers: CSV or an Excel workbook with a sheet per chart. Or
          something you keep working in: a Power BI .pbip project carrying the model, DAX measures,
          page layout, visuals, and slicers, and a Tableau .twbx with a worksheet per chart, a
          dashboard, and calculated fields. Both bundle the underlying data and a manual fallback
          (Power Query M, DAX, a .tds datasource) in case a version declines the project file. A
          binary .pbix cannot be written in a browser, so Nexora does not claim to.
        </p>
      </Section>

      <Section title="SQL Lab, Pivot Tables, and the other tools">
        <Facts
          rows={[
            { term: "SQL Lab", detail: "A real in-memory engine over the loaded dataset: SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, and aggregates. Any result can be loaded back as a new dataset." },
            { term: "Pivot Tables", detail: "Step 2 of the workflow. Drag any number of fields onto Rows, Columns, Values, and Filters; aggregate by sum, average, count, min, or max; nest levels; click any number to drill into the records behind it. Totals are recomputed from source rows, so an average of averages never appears. Exports to CSV and Excel." },
            { term: "AI Analyst", detail: "Browse and filter the grid, and ask questions about the data in plain language." },
            { term: "OCR Center", detail: "Tesseract and pdf.js run in the tab to lift tables out of images and PDFs." },
            { term: "Workflows", detail: "Records the cleaning steps and pinned charts of one analysis and replays them on a new file." },
            { term: "History & Audit", detail: "Append-only log of every import, fix, undo, query, and export, capped at 300 entries." },
          ]}
        />
      </Section>

      <Section title="Setting up AI features">
        <p>
          The AI features are optional and off until you add your own Google Gemini API key in
          Settings. The key is stored in your browser and requests go from your browser straight to
          Google, never through a Nexora server.
        </p>
        <p>
          Only the schema, column statistics, and a handful of sample rows are sent, never the full
          dataset. Without a key, the workspace still profiles, cleans, charts, queries, and reports;
          only chat and English-to-SQL are unavailable.
        </p>
      </Section>

      <Section title="Where your data goes">
        <p>
          Parsing, profiling, cleaning, charting, SQL, pivots, OCR, and report generation all happen
          in your browser. There are exactly two exceptions, both of which you trigger deliberately:
          database connections are proxied through this app&apos;s own read-only API route because a
          browser cannot open a Postgres socket, and AI features call Google with your key. The{" "}
          <Link href="/security" className="text-primary hover:underline">security page</Link>{" "}
          covers both in detail.
        </p>
      </Section>
    </ProsePage>
  );
}
