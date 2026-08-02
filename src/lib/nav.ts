/* One source of truth for application navigation. The sidebar, the top bar,
 * the mobile menu, and the breadcrumb trail all read this map, so a route can
 * never appear in one surface with a different name than in another. */

import {
  LayoutDashboard,
  Sparkles,
  FileBarChart,
  Workflow,
  Database,
  Plug,
  ScanLine,
  Users,
  History,
  HelpCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "primary" | "secondary" | "utility";

export interface NavItem {
  href: string;
  /** the one name this route is called everywhere */
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** one line of orientation, shown under the breadcrumb and in the mobile menu */
  description: string;
  /** small dot in the sidebar for AI-backed routes */
  badge?: boolean;
}

/** Home. Every "back to start" affordance points here. */
export const HOME_HREF = "/dashboard";

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "primary",
    description: "Health, findings, categories, charts, and the generated report.",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileBarChart,
    group: "primary",
    description: "The full analyst report, editable, exportable to PDF, Word, and Markdown.",
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: Workflow,
    group: "primary",
    description: "Saved analysis templates you can replay on any new dataset.",
  },
  {
    href: "/workspace",
    label: "AI Analyst",
    icon: Sparkles,
    group: "primary",
    description: "Explore rows and ask questions about the active dataset.",
    badge: true,
  },
  {
    href: "/sql-lab",
    label: "SQL Lab",
    icon: Database,
    group: "primary",
    description: "Query the loaded data with a local SQL engine.",
  },
  {
    href: "/connections",
    label: "Data Sources",
    icon: Plug,
    group: "primary",
    description: "Postgres and MySQL connections used to pull tables in.",
  },
  {
    href: "/ocr-center",
    label: "OCR Center",
    icon: ScanLine,
    group: "primary",
    description: "Lift tables out of scans, screenshots, and PDFs.",
  },
  {
    href: "/team",
    label: "Team",
    icon: Users,
    group: "primary",
    description: "People and engines attached to this workspace.",
  },
  {
    href: "/history",
    label: "History & Audit",
    icon: History,
    group: "secondary",
    description: "Every import, fix, query, and export, in order.",
  },
  {
    href: "/support",
    label: "Support Desk",
    icon: HelpCircle,
    group: "secondary",
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

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.group === "primary");
export const SECONDARY_NAV = NAV_ITEMS.filter((i) => i.group === "secondary");

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
