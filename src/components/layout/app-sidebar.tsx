"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  HeartPulse,
  Sparkles,
  Database,
  ScanLine,
  Users,
  HelpCircle,
  BookOpen,
  ArrowUpRight,
  Plug,
  History,
} from "lucide-react";
import { useNexora } from "../../lib/store";

const MENU = [
  { name: "Dataset Doctor", href: "/dashboard", icon: HeartPulse },
  { name: "AI Analyst", href: "/workspace", icon: Sparkles, badge: true },
  { name: "SQL Lab", href: "/sql-lab", icon: Database },
  { name: "Data Sources", href: "/connections", icon: Plug },
  { name: "OCR Center", href: "/ocr-center", icon: ScanLine },
  { name: "Team", href: "/team", icon: Users },
];

const SECONDARY = [
  { name: "History & Audit", href: "/history", icon: History },
  { name: "Support Desk", href: "/support", icon: HelpCircle },
  { name: "Export Reports", href: "/reports", icon: BookOpen },
];

function NavRow({
  href,
  name,
  icon: Icon,
  active,
  badge,
  small,
}: {
  href: string;
  name: string;
  icon: typeof HeartPulse;
  active: boolean;
  badge?: boolean;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`press relative flex items-center gap-3 rounded-xl ${
        small ? "px-3 py-2" : "px-3 py-2.5"
      } text-[13.5px] font-medium transition-colors ${
        active ? "text-white" : "text-on-surface-variant hover:text-white"
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-xl bg-primary/12 border border-primary/20"
          style={{ boxShadow: "inset 0 1px 0 color-mix(in oklab, #fff 7%, transparent)" }}
        />
      )}
      <Icon
        className={`relative z-10 w-[18px] h-[18px] ${active ? "text-primary" : "text-on-surface-variant"}`}
        strokeWidth={1.9}
      />
      <span className="relative z-10 flex-1">{name}</span>
      {badge && <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const setActive = useNexora((s) => s.setActive);

  return (
    <aside className="glass-panel hidden lg:flex w-64 flex-col h-full py-5 px-3 select-none shrink-0 border-y-0 border-l-0">
      {/* Brand */}
      <Link href="/" className="press flex items-center gap-2.5 mb-7 px-2">
        <svg className="w-7 h-7 shrink-0 text-primary" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 60V140L100 175L160 140V60L100 25L40 60Z" stroke="currentColor" strokeWidth="12" strokeLinejoin="round" />
          <path d="M100 25L40 60L100 95L160 60L100 25Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" />
          <path d="M100 95V175" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          <circle cx="100" cy="100" r="15" fill="currentColor" />
        </svg>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-on-surface leading-none tracking-tight">Nexora</span>
          <span className="text-[9px] text-on-surface-variant font-mono uppercase tracking-[0.2em] mt-1 opacity-60">
            Analytics OS
          </span>
        </div>
      </Link>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5">
        {MENU.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            name={item.name}
            icon={item.icon}
            badge={item.badge}
            active={pathname === item.href}
          />
        ))}
      </nav>

      {/* Datasets */}
      {datasets.length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider px-2">
            Datasets
          </span>
          <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto px-0.5">
            {datasets.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActive(d.id)}
                className={`press text-left px-2.5 py-1.5 rounded-lg text-[12px] font-mono truncate transition-colors ${
                  d.id === activeId
                    ? "bg-primary/12 text-primary"
                    : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-0.5 pt-4 border-t border-white/[0.06]">
        {SECONDARY.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            name={item.name}
            icon={item.icon}
            active={pathname === item.href}
            small
          />
        ))}

        {/* Free & local note */}
        <div className="nexora-ai-card mt-4 p-4 relative overflow-hidden">
          <div className="text-[13px] font-semibold text-on-surface mb-0.5">Free &amp; local</div>
          <div className="text-[11px] text-on-surface-variant mb-3 leading-relaxed">
            Every feature is unlocked. Your data never leaves this device.
          </div>
          <Link
            href="/history"
            className="pill w-full h-9 bg-primary text-on-primary text-[12.5px]"
          >
            View activity
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
