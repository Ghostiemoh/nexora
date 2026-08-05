import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  NAV_SECTIONS,
  WORKFLOW_NAV,
  HOME_HREF,
  SITE_HREF,
  findNavItem,
  isNavActive,
  nextStep,
  buildBreadcrumbs,
} from "./nav";

describe("nav map", () => {
  it("has no duplicate hrefs or labels", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.label)).size).toBe(NAV_ITEMS.length);
  });

  it("orders the workflow as Dataset Doctor, Pivot Tables, Dashboard, Reports", () => {
    expect(WORKFLOW_NAV.map((i) => i.label)).toEqual([
      "Dataset Doctor",
      "Pivot Tables",
      "Dashboard",
      "Reports",
    ]);
    expect(WORKFLOW_NAV.map((i) => i.step)).toEqual([1, 2, 3, 4]);
  });

  it("numbers the workflow steps consecutively from one", () => {
    const steps = WORKFLOW_NAV.map((i) => i.step);
    expect(steps).toEqual(steps.map((_, i) => i + 1));
  });

  it("routes home to the dataset picker, not to a dataset", () => {
    expect(HOME_HREF).toBe("/launch");
    expect(findNavItem(HOME_HREF)?.label).toBe("Datasets");
  });

  it("never labels the quality page as the dashboard", () => {
    expect(findNavItem("/dataset-doctor")?.label).toBe("Dataset Doctor");
    expect(findNavItem("/dashboard")?.label).toBe("Dashboard");
  });

  it("puts every item in exactly one rendered section, plus Settings", () => {
    const rendered = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(rendered).size).toBe(rendered.length);
    const missing = NAV_ITEMS.filter((i) => !rendered.includes(i.href)).map((i) => i.href);
    expect(missing).toEqual(["/settings"]);
  });
});

describe("findNavItem", () => {
  it("resolves nested routes to their section", () => {
    expect(findNavItem("/reports/quarterly")?.href).toBe("/reports");
  });

  it("returns null for routes outside the app shell", () => {
    expect(findNavItem("/pricing")).toBeNull();
  });

  it("does not match a sibling route that merely shares a prefix", () => {
    expect(findNavItem("/team-invites")).toBeNull();
  });
});

describe("isNavActive", () => {
  it("matches the route and its children only", () => {
    expect(isNavActive("/reports", "/reports")).toBe(true);
    expect(isNavActive("/reports", "/reports/q3")).toBe(true);
    expect(isNavActive("/reports", "/reports-archive")).toBe(false);
    expect(isNavActive("/reports", "/workflows")).toBe(false);
  });
});

describe("nextStep", () => {
  it("walks the workflow forward one page at a time", () => {
    expect(nextStep("/dataset-doctor")?.href).toBe("/pivot");
    expect(nextStep("/pivot")?.href).toBe("/dashboard");
    expect(nextStep("/dashboard")?.href).toBe("/reports");
  });

  it("stops at the end of the workflow", () => {
    expect(nextStep("/reports")).toBeNull();
  });

  it("has no next step for pages outside the workflow", () => {
    expect(nextStep("/sql-lab")).toBeNull();
    expect(nextStep("/launch")).toBeNull();
  });
});

describe("buildBreadcrumbs", () => {
  it("gives home no link only when you are already standing on it", () => {
    expect(buildBreadcrumbs(SITE_HREF)).toEqual([{ label: "Home", href: undefined }]);
  });

  it("links home and names the current section", () => {
    expect(buildBreadcrumbs("/workflows")).toEqual([
      { label: "Home", href: SITE_HREF },
      { label: "Workflows" },
    ]);
  });

  /* The bug this locks shut: every app route pointed "Home" at the dataset
   * picker, so nothing anywhere in the workspace could reach the front door. */
  it("reaches the front door from every route in the app", () => {
    for (const item of NAV_ITEMS) {
      const home = buildBreadcrumbs(item.href)[0];
      expect(home.label, `${item.href} lost its Home crumb`).toBe("Home");
      expect(home.href, `${item.href} cannot get back to the front door`).toBe(SITE_HREF);
    }
  });

  it("names the dataset picker as its own crumb rather than calling it Home", () => {
    expect(buildBreadcrumbs(HOME_HREF)).toEqual([
      { label: "Home", href: SITE_HREF },
      { label: "Datasets" },
    ]);
  });

  it("appends the active dataset as the final crumb", () => {
    const crumbs = buildBreadcrumbs("/sql-lab", "sales_q3.csv");
    expect(crumbs.map((c) => c.label)).toEqual(["Home", "SQL Lab", "sales_q3.csv"]);
    expect(crumbs.at(-1)!.href).toBeUndefined();
  });

  it("still shows the dataset on the picker route", () => {
    expect(buildBreadcrumbs(HOME_HREF, "sales.csv").map((c) => c.label)).toEqual([
      "Home",
      "Datasets",
      "sales.csv",
    ]);
  });
});
