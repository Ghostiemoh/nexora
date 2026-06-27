"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Plus, Bell, Settings } from "lucide-react";
import { useNexora } from "../../lib/store";
import { AuthModal } from "./auth-modal";

const LINKS = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Workspace", href: "/workspace" },
  { name: "SQL Lab", href: "/sql-lab" },
  { name: "OCR Center", href: "/ocr-center" },
];

export function TopNavbar() {
  const pathname = usePathname();
  const loadSample = useNexora((s) => s.loadSample);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 px-4 pt-3 select-none">
      <div className="glass-panel rounded-2xl h-14 flex items-center justify-between px-3 pl-4">
        {/* search */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative hidden md:flex items-center w-full max-w-xs h-9 rounded-full bg-black/25 border border-white/[0.06] px-3 focus-within:border-primary/40 transition-colors">
            <Search className="w-4 h-4 text-on-surface-variant/70 shrink-0" />
            <input
              className="flex-1 bg-transparent ml-2 text-on-surface text-[13.5px] focus:outline-none placeholder:text-on-surface-variant/40"
              placeholder="Search datasets, tables…"
              type="text"
            />
            <kbd className="hidden lg:inline text-[10px] font-mono text-on-surface-variant/50 border border-white/10 rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* segmented nav */}
        <div className="hidden lg:flex items-center gap-0.5 rounded-full bg-black/20 p-1 border border-white/[0.05]">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`press relative px-3.5 h-8 flex items-center rounded-full text-[13px] font-medium transition-colors ${
                  active ? "text-white" : "text-on-surface-variant hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-white/10 border border-white/10"
                  />
                )}
                <span className="relative z-10">{link.name}</span>
              </Link>
            );
          })}
        </div>

        {/* actions */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          <button
            type="button"
            onClick={() => loadSample()}
            className="pill hidden md:flex h-9 px-3.5 bg-primary text-on-primary text-[13px]"
          >
            <Plus className="w-4 h-4" />
            Load sample
          </button>

          <button
            type="button"
            className="press w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
          </button>
          <Link
            href="/settings"
            className="press w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-[18px] h-[18px]" />
          </Link>

          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            aria-label="Open profile"
            className="press w-9 h-9 rounded-full bg-primary/12 border border-primary/25 flex items-center justify-center text-[12px] font-semibold text-primary shrink-0"
          >
            M
          </button>
        </div>
      </div>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </nav>
  );
}
