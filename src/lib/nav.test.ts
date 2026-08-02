import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  PRIMARY_NAV,
  HOME_HREF,
  findNavItem,
  isNavActive,
  buildBreadcrumbs,
} from "./nav";

describe("nav map", () => {
  it("has no duplicate hrefs or labels", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.label)).size).toBe(NAV_ITEMS.length);
  });

  it("puts Reports in the primary group so it sits with the main modules", () => {
    expect(PRIMARY_NAV.map((i) => i.href)).toContain("/reports");
  });

  it("routes home to the dashboard", () => {
    expect(HOME_HREF).toBe("/dashboard");
    expect(findNavItem(HOME_HREF)?.label).toBe("Dashboard");
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

describe("buildBreadcrumbs", () => {
  it("gives home no link when you are already home", () => {
    const crumbs = buildBreadcrumbs("/dashboard");
    expect(crumbs).toEqual([{ label: "Home", href: undefined }]);
  });

  it("links home and names the current section", () => {
    expect(buildBreadcrumbs("/workflows")).toEqual([
      { label: "Home", href: "/dashboard" },
      { label: "Workflows" },
    ]);
  });

  it("appends the active dataset as the final crumb", () => {
    const crumbs = buildBreadcrumbs("/sql-lab", "sales_q3.csv");
    expect(crumbs.map((c) => c.label)).toEqual(["Home", "SQL Lab", "sales_q3.csv"]);
    expect(crumbs.at(-1)!.href).toBeUndefined();
  });

  it("still shows the dataset on the home route", () => {
    expect(buildBreadcrumbs("/dashboard", "sales.csv").map((c) => c.label)).toEqual([
      "Home",
      "sales.csv",
    ]);
  });
});
