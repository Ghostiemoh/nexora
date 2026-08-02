"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { useNexora } from "../../lib/store";
import { PRIMARY_NAV, SECONDARY_NAV, HOME_HREF, isNavActive } from "../../lib/nav";
import { NexoraMark } from "./nexora-mark";

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
  icon: LucideIcon;
  active: boolean;
  badge?: boolean;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
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
      {/* A left rule marks the active row even when the shared highlight is
          animating between sections. */}
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
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
      {/* Brand, and the shortest path home from anywhere */}
      <Link
        href={HOME_HREF}
        aria-label="Nexora home"
        className="press flex items-center gap-2.5 mb-7 px-2"
      >
        <NexoraMark />
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-on-surface leading-none tracking-tight">Nexora</span>
          <span className="text-[9px] text-on-surface-variant font-mono uppercase tracking-[0.2em] mt-1 opacity-60">
            Analytics OS
          </span>
        </div>
      </Link>

      {/* Primary nav */}
      <nav aria-label="Main" className="flex flex-col gap-0.5 overflow-y-auto">
        {PRIMARY_NAV.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            name={item.label}
            icon={item.icon}
            badge={item.badge}
            active={isNavActive(item.href, pathname)}
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
                aria-pressed={d.id === activeId}
                className={`press text-left px-2.5 py-1.5 rounded-lg text-[12px] font-mono truncate transition-colors cursor-pointer ${
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
        {SECONDARY_NAV.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            name={item.label}
            icon={item.icon}
            active={isNavActive(item.href, pathname)}
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
