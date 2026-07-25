"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Menu, Plus, Search, Settings, X } from "lucide-react";
import { useNexora } from "../../lib/store";
import { AuthModal } from "./auth-modal";

const LINKS = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Workspace", href: "/workspace" },
  { name: "SQL Lab", href: "/sql-lab" },
  { name: "OCR Center", href: "/ocr-center" },
  { name: "Reports", href: "/reports" },
  { name: "Support", href: "/support" },
];

function levelDot(level: string): string {
  if (level === "error") return "bg-red-400";
  if (level === "warning") return "bg-amber-400";
  if (level === "success") return "bg-emerald-400";
  return "bg-sky-400";
}

export function TopNavbar() {
  const pathname = usePathname();
  const loadSample = useNexora((s) => s.loadSample);
  const notifications = useNexora((s) => s.notifications);
  const markNotificationsRead = useNexora((s) => s.markNotificationsRead);
  const clearNotifications = useNexora((s) => s.clearNotifications);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);

  const unread = notifications.filter((n) => !n.read).length;

  const toggleBell = () => {
    setIsBellOpen((open) => {
      if (!open) markNotificationsRead();
      return !open;
    });
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
            className="press flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface lg:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
          <div className="relative hidden h-10 w-full max-w-xs items-center rounded-lg border border-white/[0.08] bg-black/15 px-3 md:flex focus-within:border-primary/60">
            <Search className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
            <input
              className="ml-2 flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none"
              placeholder="Search current data"
              type="search"
              aria-label="Search current data"
            />
          </div>
        </div>

        <div className="hidden items-center gap-1 rounded-lg border border-white/[0.07] bg-black/10 p-1 lg:flex">
          {LINKS.slice(0, 4).map((link) => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className={`press relative flex h-9 items-center rounded-md px-3 text-[13px] font-medium ${active ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}>
                {active && <motion.span layoutId="nav-active" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-md bg-primary/15" />}
                <span className="relative z-10">{link.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
          <button type="button" onClick={() => loadSample()} className="pill hidden h-10 px-3.5 bg-primary text-on-primary text-[13px] md:inline-flex">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Load sample
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={toggleBell}
              className="press relative flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
              aria-expanded={isBellOpen}
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-black text-[9px] font-bold flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {isBellOpen && (
              <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto glass-panel rounded-xl border border-white/10 shadow-2xl z-50 p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-semibold text-white uppercase tracking-wider">Alerts</span>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearNotifications()}
                      className="text-[10px] text-on-surface-variant hover:text-white cursor-pointer"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-on-surface-variant px-2 py-6 text-center">
                    No alerts yet. Imports, low health scores, failed connections, and exports show up here.
                  </p>
                ) : (
                  notifications.slice(0, 20).map((n) => (
                    <div key={n.id} className="px-2 py-2 rounded-lg hover:bg-white/[0.04] flex gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${levelDot(n.level)}`} />
                      <div className="min-w-0">
                        <p className="text-[12px] text-white font-medium leading-tight">{n.title}</p>
                        <p className="text-[11px] text-on-surface-variant leading-snug mt-0.5">{n.message}</p>
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
          <button type="button" onClick={() => setIsAuthOpen(true)} aria-label="Open local profile" className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-[12px] font-semibold text-primary">
            M
          </button>
        </div>

        {isMobileMenuOpen && (
          <div id="mobile-navigation" className="glass-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] rounded-xl p-2 shadow-xl lg:hidden">
            <div className="grid grid-cols-2 gap-1" role="menu">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setIsMobileMenuOpen(false)} role="menuitem" className={`press flex min-h-10 items-center rounded-lg px-3 text-sm ${pathname === link.href ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"}`}>
                  {link.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </nav>
  );
}
