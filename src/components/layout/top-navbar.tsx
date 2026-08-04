"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Menu, Plus, Search, Settings, X } from "lucide-react";
import { useNexora } from "../../lib/store";
import { AuthModal } from "./auth-modal";
import { NexoraMark } from "./nexora-mark";
import { NAV_ITEMS, NAV_SECTIONS, WORKFLOW_NAV, HOME_HREF, isNavActive } from "../../lib/nav";

function levelDot(level: string): string {
  if (level === "error") return "bg-red-400";
  if (level === "warning") return "bg-amber-400";
  if (level === "success") return "bg-emerald-400";
  return "bg-sky-400";
}

interface SearchHit {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function TopNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const setActive = useNexora((s) => s.setActive);
  const notifications = useNexora((s) => s.notifications);
  const markNotificationsRead = useNexora((s) => s.markNotificationsRead);
  const clearNotifications = useNexora((s) => s.clearNotifications);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const unread = notifications.filter((n) => !n.read).length;
  const activeDataset = datasets.find((d) => d.id === activeId) ?? null;

  const toggleBell = () => {
    setIsBellOpen((open) => {
      if (!open) markNotificationsRead();
      return !open;
    });
  };

  /* Search covers the three things you actually look for in a workspace: a
   * page, a loaded dataset, or a column inside the active one. */
  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const out: SearchHit[] = [];

    for (const item of NAV_ITEMS) {
      if (item.label.toLowerCase().includes(q)) {
        out.push({
          id: `nav-${item.href}`,
          label: item.label,
          hint: "Page",
          run: () => router.push(item.href),
        });
      }
    }
    for (const dataset of datasets) {
      if (dataset.name.toLowerCase().includes(q)) {
        out.push({
          id: `ds-${dataset.id}`,
          label: dataset.name,
          hint: `Dataset · ${dataset.rows.length.toLocaleString("en-US")} rows`,
          run: () => setActive(dataset.id),
        });
      }
    }
    if (activeDataset) {
      for (const column of activeDataset.columns) {
        if (column.toLowerCase().includes(q)) {
          const type = activeDataset.profiles.find((p) => p.name === column)?.type ?? "column";
          out.push({
            id: `col-${column}`,
            label: column,
            hint: `${type} in ${activeDataset.name}`,
            run: () => router.push("/dataset-doctor#schema"),
          });
        }
      }
    }
    return out.slice(0, 8);
  }, [query, datasets, activeDataset, router, setActive]);

  const runHit = (hit: SearchHit) => {
    hit.run();
    setQuery("");
    setIsSearchOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 px-3 pt-3 sm:px-4" aria-label="Application navigation">
      <div className="glass-panel relative flex h-14 items-center justify-between rounded-xl px-3 sm:pl-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={isMobileMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
            className="press flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface lg:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>

          {/* The mark is a home button on small screens, where the sidebar
              carrying it is not on screen. */}
          <Link
            href={HOME_HREF}
            aria-label="Nexora home"
            className="press flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/5 lg:hidden"
          >
            <NexoraMark className="h-5 w-5" />
          </Link>

          <div className="relative hidden h-10 w-full max-w-xs md:block">
            <div className="flex h-10 items-center rounded-lg border border-white/[0.08] bg-black/15 px-3 focus-within:border-primary/60">
              <Search className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setIsSearchOpen(false), 120)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hits.length > 0) runHit(hits[0]);
                  if (e.key === "Escape") {
                    setQuery("");
                    searchRef.current?.blur();
                  }
                }}
                className="ml-2 flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none"
                placeholder="Search pages, datasets, columns"
                type="search"
                aria-label="Search pages, datasets and columns"
                role="combobox"
                aria-expanded={isSearchOpen && hits.length > 0}
                aria-controls="workspace-search-results"
              />
            </div>
            {isSearchOpen && query.trim().length > 0 && (
              <div
                id="workspace-search-results"
                role="listbox"
                className="menu-panel absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl p-1"
              >
                {hits.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-on-surface-variant">
                    Nothing matches “{query.trim()}”.
                  </p>
                ) : (
                  hits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runHit(hit)}
                      className="press flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.06]"
                    >
                      <span className="truncate text-[13px] text-on-surface">{hit.label}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-on-surface-variant">
                        {hit.hint}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* The three workflow steps, in order, on wide screens */}
        <div className="hidden items-center gap-1 rounded-lg border border-white/[0.07] bg-black/10 p-1 xl:flex">
          {WORKFLOW_NAV.map((link) => {
            const active = isNavActive(link.href, pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`press relative flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium ${active ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-md bg-primary/15"
                  />
                )}
                <span className="relative z-10 font-mono text-[10px] text-on-surface-variant">{link.step}</span>
                <span className="relative z-10">{link.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
          <Link href={HOME_HREF} className="pill hidden h-10 bg-primary px-3.5 text-[13px] text-on-primary md:inline-flex">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New dataset
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={toggleBell}
              className="press relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
              aria-expanded={isBellOpen}
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-black">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {isBellOpen && (
              <div className="menu-panel absolute right-0 top-12 z-50 max-h-96 w-80 overflow-y-auto rounded-xl p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white">Alerts</span>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearNotifications()}
                      className="cursor-pointer text-[10px] text-on-surface-variant hover:text-white"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-on-surface-variant">
                    No alerts yet. Imports, low health scores, failed connections, and exports show up here.
                  </p>
                ) : (
                  notifications.slice(0, 20).map((n) => (
                    <div key={n.id} className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${levelDot(n.level)}`} />
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium leading-tight text-white">{n.title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-on-surface-variant">{n.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <Link href="/settings" className="press flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface" aria-label="Settings">
            <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>
          <button type="button" onClick={() => setIsAuthOpen(true)} aria-label="Open local profile" className="press flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-[12px] font-semibold text-primary">
            M
          </button>
        </div>

        {isMobileMenuOpen && (
          <div id="mobile-navigation" className="menu-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-[70vh] overflow-y-auto rounded-xl p-2 lg:hidden">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title ?? "start"} className="mb-2 last:mb-0">
                {section.title && (
                  <span className="block px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    {section.title}
                  </span>
                )}
                <div className="grid grid-cols-2 gap-1" role="menu">
                  {section.items.map((link) => {
                    const active = isNavActive(link.href, pathname);
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        role="menuitem"
                        aria-current={active ? "page" : undefined}
                        className={`press flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm ${active ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </nav>
  );
}
