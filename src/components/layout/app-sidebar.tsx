"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, type LucideIcon } from "lucide-react";
import { useNexora } from "../../lib/store";
import { NAV_SECTIONS, UTILITY_NAV, HOME_HREF, isNavActive, type NavItem } from "../../lib/nav";
import { NexoraMark } from "./nexora-mark";

function NavRow({
  href,
  name,
  icon: Icon,
  active,
  badge,
  step,
}: {
  href: string;
  name: string;
  icon: LucideIcon;
  active: boolean;
  badge?: boolean;
  step?: NavItem["step"];
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`press relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors ${
        active ? "text-white" : "text-on-surface-variant hover:text-white"
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-xl border border-primary/20 bg-primary/12"
          style={{ boxShadow: "inset 0 1px 0 color-mix(in oklab, #fff 7%, transparent)" }}
        />
      )}
      {/* A left rule marks the active row even when the shared highlight is
          animating between sections. */}
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
      )}
      <Icon
        className={`relative z-10 h-[18px] w-[18px] ${active ? "text-primary" : "text-on-surface-variant"}`}
        strokeWidth={1.9}
      />
      <span className="relative z-10 flex-1 truncate">{name}</span>
      {/* The workflow steps are numbered, so the order to work in is visible
          rather than something you have to remember. */}
      {step !== undefined && (
        <span
          className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-[5px] text-[9px] font-semibold tabular-nums ${
            active ? "bg-primary/25 text-primary" : "bg-white/[0.06] text-on-surface-variant/80"
          }`}
          aria-hidden="true"
        >
          {step}
        </span>
      )}
      {badge && <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const setActive = useNexora((s) => s.setActive);

  const renderItem = (item: NavItem) => (
    <NavRow
      key={item.href}
      href={item.href}
      name={item.label}
      icon={item.icon}
      badge={item.badge}
      step={item.step}
      active={isNavActive(item.href, pathname)}
    />
  );

  return (
    <aside className="glass-panel hidden h-full w-64 shrink-0 select-none flex-col border-y-0 border-l-0 px-3 py-5 lg:flex">
      {/* Brand, and the shortest path home from anywhere */}
      <Link
        href={HOME_HREF}
        aria-label="Nexora home"
        className="press mb-6 flex items-center gap-2.5 px-2"
      >
        <NexoraMark />
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold leading-none tracking-tight text-on-surface">Nexora</span>
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant opacity-60">
            Analytics OS
          </span>
        </div>
      </Link>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title ?? "start"} className="flex flex-col gap-0.5">
            {section.title && (
              <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                {section.title}
              </span>
            )}
            {section.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Loaded datasets, so switching between them never needs a page change */}
      {datasets.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Loaded
            </span>
            <Link
              href={HOME_HREF}
              aria-label="Add a dataset"
              title="Add a dataset"
              className="press flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto px-0.5">
            {datasets.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActive(d.id)}
                aria-pressed={d.id === activeId}
                title={d.name}
                className={`press cursor-pointer truncate rounded-lg px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors ${
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

      <div className="mt-4 flex flex-col gap-0.5 border-t border-white/[0.06] pt-4">
        {UTILITY_NAV.map(renderItem)}
        <p className="px-3 pt-3 text-[11px] leading-relaxed text-on-surface-variant/70">
          Every feature is unlocked. Your data never leaves this device.
        </p>
      </div>
    </aside>
  );
}
