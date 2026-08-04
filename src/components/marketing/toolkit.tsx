import Link from "next/link";
import {
  ArrowUpRight,
  Database,
  FileBarChart,
  GitMerge,
  History,
  LayoutDashboard,
  Plug,
  ScanLine,
  Sparkles,
  Stethoscope,
  Table2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./sleek";

interface Tool {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  /** the three-step spine gets visual weight over the side tools */
  primary?: boolean;
}

/* One card per tool that exists in the app. Every href resolves to a working
 * page; nothing here is a mock or a roadmap item. */
const TOOLS: Tool[] = [
  {
    icon: Stethoscope,
    title: "Dataset Doctor",
    body: "Scores completeness, accuracy, validity, and consistency, then names every defect and hands you the fix. Duplicates, gaps, outliers, broken encodings, Excel serial dates, and stray casing all get caught.",
    href: "/dataset-doctor",
    primary: true,
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    body: "Reads your column names and types, works out which KPIs the data can support, and lays out the charts that fit. Filter the page, cross-filter by clicking, switch any chart to any type that works.",
    href: "/dashboard",
    primary: true,
  },
  {
    icon: FileBarChart,
    title: "Reports",
    body: "The written analysis: executive summary, quality, KPIs, trends, findings, root causes, recommendations. Edit any section, then export to PDF, Word, or Markdown.",
    href: "/reports",
    primary: true,
  },
  {
    icon: Sparkles,
    title: "AI Analyst",
    body: "Ask in plain language and get an answer with the table behind it. Bring your own Gemini key for English-to-SQL and chat over the data.",
    href: "/workspace",
  },
  {
    icon: Database,
    title: "SQL Lab",
    body: "A real in-memory SQL engine over your file. SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, aggregates, all client-side. Load any result back as a new dataset.",
    href: "/sql-lab",
  },
  {
    icon: Table2,
    title: "Pivot Table",
    body: "Cross-tabulate two fields, aggregate with sum, average, min, max, or count, and read the totals both ways. Every total recomputes from source rows, so an average of averages never happens.",
    href: "/pivot",
  },
  {
    icon: ScanLine,
    title: "OCR Center",
    body: "Drop a scanned invoice, a screenshot, or a PDF and pull the table out into an editable grid, ready to profile like any other dataset.",
    href: "/ocr-center",
  },
  {
    icon: Plug,
    title: "Data Sources",
    body: "Read-only PostgreSQL and MySQL connections. Run a query, pull the result into the workspace, and work on it locally from there.",
    href: "/connections",
  },
  {
    icon: Workflow,
    title: "Workflows",
    body: "Record the cleaning steps and charts from one analysis, then replay the whole thing on next month's file in a single click.",
    href: "/workflows",
  },
  {
    icon: GitMerge,
    title: "Joins & transforms",
    body: "Inner, left, right, and full joins across two loaded datasets, plus find and replace and text-to-columns, each one undoable and recorded.",
    href: "/dataset-doctor",
  },
  {
    icon: History,
    title: "History & audit",
    body: "Every import, fix, undo, query, and export in order, append-only. Re-download any past export without regenerating it.",
    href: "/history",
  },
];

export function Toolkit() {
  return (
    <section id="toolkit" className="px-6 py-20">
      <Reveal className="mx-auto mb-14 max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-[-0.02em] text-white md:text-5xl">
          An entire data team&apos;s toolkit.
          <br />
          <span className="text-on-surface-variant">All of it working today.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-on-surface-variant">
          Eleven tools, one workspace, no server. Each card below links straight into the thing it
          describes.
        </p>
      </Reveal>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool, i) => {
          const Icon = tool.icon;
          return (
            <Reveal key={tool.title} delay={Math.min(i * 0.04, 0.3)}>
              <Link
                href={tool.href}
                className={`group glass sheen sweep-on-hover flex h-full flex-col rounded-3xl p-6 transition-colors hover:border-primary/25 ${
                  tool.primary ? "ring-1 ring-primary/20" : ""
                }`}
              >
                <div className="mb-4 flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12">
                    <Icon className="h-4.5 w-4.5 text-primary" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-primary"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="mb-2 text-[15px] font-semibold text-white">{tool.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-on-surface-variant">{tool.body}</p>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
