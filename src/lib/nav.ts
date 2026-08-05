/* One source of truth for application navigation. The sidebar, the top bar,
 * the mobile menu, and the breadcrumb trail all read this map, so a route can
 * never appear in one surface with a different name than in another.
 *
 * The order encodes the analysis workflow itself: pick a dataset, check its
 * quality, summarise it in a pivot, build the dashboard, write the report.
 * Everything else is a tool you reach for along the way.
 *
 * Pivot Tables sits inside that spine rather than off in the tool drawer,
 * because summarising is what an analyst actually does between cleaning a file
 * and charting it — putting it anywhere else asks people to invent the step
 * themselves. */

import {
  LayoutDashboard,
  Stethoscope,
  Sparkles,
  FileBarChart,
  Workflow,
  Database,
  Plug,
  ScanLine,
  Table2,
  Users,
  History,
  HelpCircle,
  Settings,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";

/** `start` is the dataset picker, `workflow` is the three-step spine, `tools`
 *  are the modules you dip into, `workspace` is record-keeping, `utility` is
 *  configuration. */
export type NavGroup = "start" | "workflow" | "tools" | "workspace" | "utility";

export interface NavItem {
  href: string;
  /** the one name this route is called everywhere */
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** one line of orientation, shown under the breadcrumb and in the mobile menu */
  description: string;
  /** position in the analysis workflow, rendered as a step number */
  step?: 1 | 2 | 3 | 4;
  /** small dot in the sidebar for AI-backed routes */
  badge?: boolean;
}

/** Home is the dataset picker, never a dataset. Opening Nexora must not decide
 *  on your behalf which file you meant to work on. */
export const HOME_HREF = "/launch";

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/launch",
    label: "Datasets",
    icon: FolderOpen,
    group: "start",
    description: "Continue with a dataset you already loaded, or bring in a new one.",
  },
  {
    href: "/dataset-doctor",
    label: "Dataset Doctor",
    icon: Stethoscope,
    group: "workflow",
    step: 1,
    description: "Data quality: missing values, duplicates, outliers, types, and the fixes for each.",
  },
  {
    href: "/pivot",
    label: "Pivot Tables",
    icon: Table2,
    group: "workflow",
    step: 2,
    description:
      "Summarize the clean data: drag fields onto rows, columns, and values, then drill into any number.",
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "workflow",
    step: 3,
    description: "Business intelligence: KPIs, trends, and breakdowns built from the clean data.",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileBarChart,
    group: "workflow",
    step: 4,
    description: "The written report: summary, findings, recommendations, exported to PDF, Word, or Markdown.",
  },
  {
    href: "/workspace",
    label: "AI Analyst",
    icon: Sparkles,
    group: "tools",
    description: "Explore rows and ask questions about the active dataset in plain language.",
    badge: true,
  },
  {
    href: "/sql-lab",
    label: "SQL Lab",
    icon: Database,
    group: "tools",
    description: "Query the loaded data with a local SQL engine.",
  },
  {
    href: "/ocr-center",
    label: "OCR Center",
    icon: ScanLine,
    group: "tools",
    description: "Lift tables out of scans, screenshots, and PDFs.",
  },
  {
    href: "/connections",
    label: "Data Sources",
    icon: Plug,
    group: "tools",
    description: "PostgreSQL and MySQL connections used to pull tables in.",
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: Workflow,
    group: "tools",
    description: "Saved analysis templates you can replay on any new dataset.",
  },
  {
    href: "/history",
    label: "History & Audit",
    icon: History,
    group: "workspace",
    description: "Every import, fix, query, and export, in order.",
  },
  {
    href: "/team",
    label: "Team",
    icon: Users,
    group: "workspace",
    description: "People and engines attached to this workspace.",
  },
  {
    href: "/support",
    label: "Support Desk",
    icon: HelpCircle,
    group: "workspace",
    description: "Open tickets and known issues.",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    group: "utility",
    description: "API keys, local storage, and workspace preferences.",
  },
];

const byGroup = (group: NavGroup) => NAV_ITEMS.filter((i) => i.group === group);

/** The dataset picker. */
export const START_NAV = byGroup("start");
/** Dataset Doctor → Pivot Tables → Dashboard → Reports, in order. */
export const WORKFLOW_NAV = byGroup("workflow");
export const TOOLS_NAV = byGroup("tools");
export const WORKSPACE_NAV = byGroup("workspace");
export const UTILITY_NAV = byGroup("utility");

/** Sidebar sections, in render order. */
export const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: START_NAV },
  { title: "Analysis", items: WORKFLOW_NAV },
  { title: "Tools", items: TOOLS_NAV },
  { title: "Workspace", items: WORKSPACE_NAV },
];

/** The nav entry a pathname belongs to. Nested routes resolve to their parent
 *  section, so /reports/anything still highlights Reports. */
export function findNavItem(pathname: string): NavItem | null {
  const exact = NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact;
  // Longest prefix wins, so /sql-lab/x picks /sql-lab and never /.
  const prefixed = NAV_ITEMS.filter((i) => pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length
  );
  return prefixed[0] ?? null;
}

/** True when a nav row should render as active for the current pathname. */
export function isNavActive(itemHref: string, pathname: string): boolean {
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

/** The next step in the analysis workflow, used by the "what now" footer each
 *  workflow page carries. Returns null at the end of the line. */
export function nextStep(pathname: string): NavItem | null {
  const current = findNavItem(pathname);
  if (!current?.step) return null;
  return WORKFLOW_NAV.find((i) => i.step === current.step! + 1) ?? null;
}

export interface Crumb {
  label: string;
  /** absent on the final crumb, which is the page you are already on */
  href?: string;
}

/** Breadcrumb trail: Home → section → active dataset. The dataset crumb is what
 *  makes the trail useful here, since every section reads the same active file. */
export function buildBreadcrumbs(pathname: string, datasetName?: string | null): Crumb[] {
  const item = findNavItem(pathname);
  const onHome = pathname === HOME_HREF;

  const crumbs: Crumb[] = [{ label: "Home", href: onHome ? undefined : HOME_HREF }];

  if (item && !onHome) {
    crumbs.push({ label: item.label });
  }

  if (datasetName) {
    crumbs.push({ label: datasetName });
  }

  return crumbs;
}
