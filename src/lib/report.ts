/* Automated report generation. Turns a profiled dataset plus its findings into
 * the report an analyst would actually hand over: executive summary first,
 * evidence in the middle, recommendations at the end.
 *
 * Sections carry structured tables and prose separately, so the UI can let a
 * user rewrite the prose before export without corrupting the numbers. */

import type { Dataset } from "./types";
import type { Intelligence, Finding } from "./insights";
import { formatNumber } from "./insights";
import type { DashboardSpec } from "./auto-dashboard";

export interface ReportTable {
  headers: string[];
  rows: string[][];
}

export interface ReportSection {
  id: string;
  title: string;
  /** prose, editable before export */
  body: string;
  bullets?: string[];
  /** render the bullets as a numbered list; the numbers are added at render
   *  time so the stored text never carries them */
  ordered?: boolean;
  table?: ReportTable;
  /** chart ids from the dashboard spec that belong under this section */
  chartIds?: string[];
  /** unchecked sections are kept in the document but excluded from exports */
  include: boolean;
}

export interface Report {
  title: string;
  datasetName: string;
  /** ISO timestamp, passed in so nothing in here reads the clock */
  generatedAt: string;
  sections: ReportSection[];
}

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  critical: "Critical",
  warning: "Needs attention",
  info: "For information",
  positive: "Positive",
};

/** Build the full report. `generatedAt` is supplied by the caller so this stays
 *  a pure function and renders identically on every call. */
export function buildReport(
  ds: Dataset,
  intel: Intelligence,
  dashboard: DashboardSpec,
  generatedAt: string
): Report {
  const cleanName = ds.name.replace(/\.[^/.]+$/, "");
  const findings = intel.findings;

  return {
    title: `${cleanName} analysis report`,
    datasetName: ds.name,
    generatedAt,
    sections: [
      executiveSummary(ds, intel),
      datasetOverview(ds),
      qualityAssessment(ds),
      kpiSection(dashboard),
      trendsSection(findings),
      visualizationsSection(dashboard),
      findingsSection(findings),
      rootCauseSection(findings),
      recommendationsSection(intel),
      conclusionSection(ds, intel),
    ],
  };
}

/* ── sections ── */

function executiveSummary(ds: Dataset, intel: Intelligence): ReportSection {
  const headline = intel.findings.slice(0, 3);
  return {
    id: "executive-summary",
    title: "Executive summary",
    body: intel.summary,
    bullets: headline.map((f) => `${SEVERITY_LABEL[f.severity]}: ${f.title}. ${f.what}`),
    include: true,
  };
}

function datasetOverview(ds: Dataset): ReportSection {
  const dateCols = ds.profiles.filter((p) => p.dateMin);
  const coverage = dateCols[0]
    ? ` Records span ${dateCols[0].dateMin} to ${dateCols[0].dateMax} on ${dateCols[0].name}.`
    : "";

  return {
    id: "dataset-overview",
    title: "Dataset overview",
    body:
      `${ds.name} contains ${formatNumber(ds.rows.length)} rows across ${ds.columns.length} columns.` +
      coverage +
      (ds.truncated
        ? " The import stopped at the row cap, so this covers only part of the source file."
        : "") +
      (ds.changelog.length > 1
        ? ` ${ds.changelog.length - 1} cleaning operation(s) were applied before this analysis.`
        : ""),
    table: {
      headers: ["Column", "Type", "Complete", "Distinct", "Missing"],
      rows: ds.profiles.map((p) => [
        p.name,
        p.type,
        `${p.completeness.toFixed(1)}%`,
        String(p.uniqueCount),
        String(p.missingCount),
      ]),
    },
    include: true,
  };
}

function qualityAssessment(ds: Dataset): ReportSection {
  const open = ds.diagnostics.filter((d) => d.severity === "warning");
  const verdict =
    ds.health.overall >= 90 && open.length === 0
      ? "The dataset is fit for reporting as it stands."
      : ds.health.overall >= 70
        ? "The dataset is usable, but the issues below should be resolved before the numbers are published."
        : "The dataset is not yet fit for reporting. Resolve the issues below before quoting any total.";

  return {
    id: "data-quality",
    title: "Data quality assessment",
    body: `Overall health scores ${ds.health.overall} out of 100. ${verdict}${
      open.length > 0 ? ` ${open.length} issue(s) remain open.` : ""
    }`,
    table: {
      headers: ["Dimension", "Score", "What it measures"],
      rows: [
        ["Completeness", `${ds.health.completeness}%`, "Share of cells that carry a value"],
        ["Accuracy", `${ds.health.accuracy}%`, "Numeric values inside the expected range"],
        ["Validity", `${ds.health.validity}%`, "Cells matching their inferred type"],
        ["Consistency", `${ds.health.consistency}%`, "Whitespace, casing, encoding, duplicates"],
      ],
    },
    bullets: open.slice(0, 8).map((d) => `${d.title}: ${d.description}`),
    include: true,
  };
}

function kpiSection(dashboard: DashboardSpec): ReportSection {
  return {
    id: "kpis",
    title: "Key performance indicators",
    body:
      dashboard.kpis.length > 0
        ? "The headline measures derived from the dataset, computed across every row after cleaning."
        : "No numeric measures were found, so no KPIs could be computed.",
    table: {
      headers: ["Indicator", "Value", "Detail"],
      rows: dashboard.kpis.map((k) => [
        k.label,
        k.format === "percent" ? `${k.value}%` : formatNumber(k.value),
        k.sub ?? "",
      ]),
    },
    include: true,
  };
}

function trendsSection(findings: Finding[]): ReportSection {
  const relevant = findings.filter(
    (f) => f.kind === "trend" || f.kind === "change" || f.kind === "correlation"
  );

  return {
    id: "trends",
    title: "Trends and patterns",
    body:
      relevant.length > 0
        ? "Movement over time and relationships between measures, with the strength of each pattern stated so it can be weighed rather than assumed."
        : "No date column with enough spread was available, so no time-based trend could be measured.",
    bullets: relevant.map((f) => `${f.title}. ${f.what}${f.why ? ` ${f.why}` : ""}`),
    include: true,
  };
}

function visualizationsSection(dashboard: DashboardSpec): ReportSection {
  return {
    id: "visualizations",
    title: "Visualizations",
    body:
      dashboard.charts.length > 0
        ? `${dashboard.charts.length} chart(s) were selected automatically based on the column types present. They are rendered in full in the on-screen report and in the printed PDF.`
        : "The dataset does not carry enough structure to chart. Add a numeric, date, or category column.",
    bullets: dashboard.charts.map((c) => `${c.title} (${c.kind})`),
    chartIds: dashboard.charts.map((c) => c.id),
    include: true,
  };
}

function findingsSection(findings: Finding[]): ReportSection {
  return {
    id: "findings",
    title: "Significant findings",
    body:
      findings.length > 0
        ? `${findings.length} finding(s), ordered by how much they should change what you do next.`
        : "No material findings surfaced from this dataset.",
    table: {
      headers: ["Priority", "Finding", "Evidence", "Impact"],
      rows: findings.map((f) => [
        SEVERITY_LABEL[f.severity],
        f.title,
        f.what,
        f.impact ?? "",
      ]),
    },
    include: true,
  };
}

function rootCauseSection(findings: Finding[]): ReportSection {
  const explained = findings.filter((f) => f.why);

  return {
    id: "root-cause",
    title: "Root cause analysis",
    body:
      explained.length > 0
        ? "What the data itself supports as an explanation. These are the most probable causes given the evidence available, not confirmed causes, and each should be checked against the source system before it is acted on."
        : "No finding carried enough supporting evidence to propose a cause.",
    bullets: explained.map((f) => `${f.title} — ${f.why}`),
    include: true,
  };
}

function recommendationsSection(intel: Intelligence): ReportSection {
  return {
    id: "recommendations",
    title: "Recommendations",
    body:
      intel.recommendations.length > 0
        ? "Actions in priority order. Each one comes from a finding above, so the reasoning behind it is traceable."
        : "No actions are required from this dataset in its current state.",
    bullets: intel.recommendations,
    ordered: true,
    include: true,
  };
}

function conclusionSection(ds: Dataset, intel: Intelligence): ReportSection {
  const critical = intel.findings.filter((f) => f.severity === "critical").length;
  const positive = intel.findings.filter((f) => f.severity === "positive").length;

  const verdict =
    critical > 0
      ? `${critical} critical issue(s) must be resolved before these numbers are used for a decision.`
      : intel.findings.length > 0
        ? "Nothing critical was found. The remaining items are improvements rather than blockers."
        : "Nothing of concern was found in this dataset.";

  return {
    id: "conclusion",
    title: "Conclusion",
    body: `${verdict}${
      positive > 0 ? ` ${positive} finding(s) are working in your favour and are worth protecting.` : ""
    } Data health stands at ${ds.health.overall}%, and every figure in this report was computed locally from ${formatNumber(ds.rows.length)} rows of ${ds.name}.`,
    include: true,
  };
}

/* ── serialization ── */

const escapeCell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** Markdown export. Sections the user unchecked are omitted. */
export function reportToMarkdown(report: Report): string {
  const parts: string[] = [
    `# ${report.title}`,
    "",
    `Generated ${report.generatedAt.slice(0, 10)} from ${report.datasetName}. Compiled locally by Nexora.`,
    "",
  ];

  for (const section of report.sections) {
    if (!section.include) continue;
    parts.push(`## ${section.title}`, "");
    if (section.body.trim()) parts.push(section.body.trim(), "");

    if (section.bullets && section.bullets.length > 0) {
      section.bullets.forEach((b, i) => parts.push(section.ordered ? `${i + 1}. ${b}` : `- ${b}`));
      parts.push("");
    }

    if (section.table && section.table.rows.length > 0) {
      parts.push(`| ${section.table.headers.map(escapeCell).join(" | ")} |`);
      parts.push(`| ${section.table.headers.map(() => "---").join(" | ")} |`);
      for (const row of section.table.rows) {
        parts.push(`| ${row.map(escapeCell).join(" | ")} |`);
      }
      parts.push("");
    }
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Self-contained HTML, used for the Word fallback and for printing. */
export function reportToHtml(report: Report): string {
  const body: string[] = [
    `<h1>${escapeHtml(report.title)}</h1>`,
    `<p class="meta">Generated ${escapeHtml(report.generatedAt.slice(0, 10))} from ${escapeHtml(report.datasetName)}. Compiled locally by Nexora.</p>`,
  ];

  for (const section of report.sections) {
    if (!section.include) continue;
    body.push(`<h2>${escapeHtml(section.title)}</h2>`);
    if (section.body.trim()) body.push(`<p>${escapeHtml(section.body.trim())}</p>`);

    if (section.bullets && section.bullets.length > 0) {
      const tag = section.ordered ? "ol" : "ul";
      body.push(`<${tag}>`);
      for (const b of section.bullets) body.push(`<li>${escapeHtml(b)}</li>`);
      body.push(`</${tag}>`);
    }

    if (section.table && section.table.rows.length > 0) {
      body.push("<table><thead><tr>");
      for (const h of section.table.headers) body.push(`<th>${escapeHtml(h)}</th>`);
      body.push("</tr></thead><tbody>");
      for (const row of section.table.rows) {
        body.push("<tr>");
        for (const cell of row) body.push(`<td>${escapeHtml(cell)}</td>`);
        body.push("</tr>");
      }
      body.push("</tbody></table>");
    }
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body { font-family: Calibri, Arial, sans-serif; color: #1a1a1a; line-height: 1.5; }
h1 { font-size: 24pt; margin-bottom: 4pt; }
h2 { font-size: 15pt; margin-top: 20pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
p.meta { color: #666; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 9pt; }
th, td { border: 1px solid #bbb; padding: 5pt 7pt; text-align: left; vertical-align: top; }
th { background: #f2f2f2; }
li { margin-bottom: 4pt; }
</style></head>
<body>
${body.join("\n")}
</body></html>`;
}

/** Plain-text summary handed to the AI as context when a key is configured. */
export function reportToPlainText(report: Report): string {
  return reportToMarkdown(report).replace(/^#+ /gm, "").replace(/\|/g, " ");
}
