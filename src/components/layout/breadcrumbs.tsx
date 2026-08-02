"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { useNexora } from "@/lib/store";
import { buildBreadcrumbs, findNavItem, HOME_HREF } from "@/lib/nav";

/** Where am I, and how do I get back. Rendered under the top bar on every app
 *  route; the active dataset is the last crumb because every section reads it. */
export function Breadcrumbs() {
  const pathname = usePathname();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);

  const activeDataset = datasets.find((d) => d.id === activeId) ?? null;
  const crumbs = buildBreadcrumbs(pathname, activeDataset?.name);
  const section = findNavItem(pathname);

  return (
    <div className="px-3 pt-2.5 sm:px-4">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]"
      >
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const isHome = i === 0;

          return (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 text-on-surface-variant/50"
                  aria-hidden="true"
                />
              )}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="press flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-on-surface-variant transition-colors hover:bg-white/5 hover:text-on-surface"
                >
                  {isHome && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 ${
                    last ? "font-medium text-on-surface" : "text-on-surface-variant"
                  } ${i > 0 && last && activeDataset ? "font-mono text-primary" : ""}`}
                >
                  {isHome && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      {section && (
        <p className="mt-0.5 px-1.5 text-[11px] text-on-surface-variant/70">{section.description}</p>
      )}
    </div>
  );
}

export { HOME_HREF };
