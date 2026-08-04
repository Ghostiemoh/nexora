"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import {
  Database,
  FileBarChart,
  LayoutDashboard,
  Plug,
  ScanLine,
  Sparkles,
  Stethoscope,
  Table2,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/* The product menu lists routes that exist and work. Anything not shipped does
 * not get a menu entry, so the nav can never promise more than the app has. */
interface MenuLink {
  label: string;
  href: string;
  blurb: string;
  icon: LucideIcon;
}

const WORKFLOW: MenuLink[] = [
  {
    label: "Dataset Doctor",
    href: "/dataset-doctor",
    blurb: "Score quality, then fix what is broken.",
    icon: Stethoscope,
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    blurb: "KPIs and charts chosen for your columns.",
    icon: LayoutDashboard,
  },
  {
    label: "Reports",
    href: "/reports",
    blurb: "The written analysis, exported to PDF or Word.",
    icon: FileBarChart,
  },
];

const TOOLS: MenuLink[] = [
  { label: "AI Analyst", href: "/workspace", blurb: "Ask questions in plain English.", icon: Sparkles },
  { label: "SQL Lab", href: "/sql-lab", blurb: "A real in-memory SQL engine.", icon: Database },
  { label: "Pivot Table", href: "/pivot", blurb: "Cross-tabulate and total both ways.", icon: Table2 },
  { label: "OCR Center", href: "/ocr-center", blurb: "Pull tables out of scans and PDFs.", icon: ScanLine },
  { label: "Data Sources", href: "/connections", blurb: "PostgreSQL and MySQL connections.", icon: Plug },
  { label: "Workflows", href: "/workflows", blurb: "Replay a whole analysis on a new file.", icon: Workflow },
];

const SIMPLE_LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Company", href: "/company" },
];

function MenuItem({ link, onNavigate }: { link: MenuLink; onNavigate?: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className="press flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-white">{link.label}</span>
        <span className="block text-[12px] leading-snug text-zinc-500">{link.blurb}</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const [productOpen, setProductOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);

  // A menu that stays open after you click elsewhere feels broken.
  useEffect(() => {
    if (!productOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!productRef.current?.contains(e.target as Node)) setProductOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProductOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [productOpen]);

  return (
    <header className="sticky top-0 z-50 select-none px-4 pt-4">
      <div className="glass sheen mx-auto flex h-14 max-w-4xl items-center justify-between rounded-full px-3 pl-5">
        <Link href="/" className="press flex shrink-0 items-center gap-2.5" aria-label="Nexora home">
          <svg className="h-7 w-7" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M40 60V140L100 175L160 140V60L100 25L40 60Z" stroke="#c0c1ff" strokeWidth="12" strokeLinejoin="round" />
            <path d="M100 25L40 60L100 95L160 60L100 25Z" fill="#c0c1ff" fillOpacity="0.2" stroke="#c0c1ff" strokeWidth="8" strokeLinejoin="round" />
            <circle cx="100" cy="100" r="15" fill="#c0c1ff" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-white">Nexora</span>
        </Link>

        {/* Desktop nav: one menu for the product, three flat links, one CTA. */}
        <nav className="hidden items-center gap-1 text-[13.5px] text-on-surface-variant md:flex" aria-label="Main">
          <div ref={productRef} className="relative">
            <button
              type="button"
              onClick={() => setProductOpen((v) => !v)}
              aria-expanded={productOpen}
              aria-haspopup="true"
              className={`press flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white ${
                productOpen ? "bg-white/5 text-white" : ""
              }`}
            >
              Product
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${productOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {productOpen && (
              <div className="menu-panel absolute left-1/2 top-11 w-[560px] -translate-x-1/2 rounded-2xl p-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                      The workflow
                    </p>
                    {WORKFLOW.map((link) => (
                      <MenuItem key={link.href} link={link} onNavigate={() => setProductOpen(false)} />
                    ))}
                  </div>
                  <div>
                    <p className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                      Tools
                    </p>
                    {TOOLS.map((link) => (
                      <MenuItem key={link.href} link={link} onNavigate={() => setProductOpen(false)} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {SIMPLE_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="press rounded-full px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/launch"
            className="pill h-9 bg-white px-4 text-[13.5px] font-semibold text-black"
          >
            Open workspace
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="press flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-white md:hidden"
          >
            {mobileOpen ? <X className="h-4.5 w-4.5" aria-hidden="true" /> : <Menu className="h-4.5 w-4.5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="marketing-mobile-nav"
          className="menu-panel mx-auto mt-2 max-h-[70vh] max-w-4xl overflow-y-auto rounded-3xl p-3 md:hidden"
        >
          <p className="px-3 pb-1.5 pt-1 text-[10px] uppercase tracking-wider text-zinc-500">
            The workflow
          </p>
          {WORKFLOW.map((link) => (
            <MenuItem key={link.href} link={link} onNavigate={() => setMobileOpen(false)} />
          ))}
          <p className="px-3 pb-1.5 pt-3 text-[10px] uppercase tracking-wider text-zinc-500">Tools</p>
          {TOOLS.map((link) => (
            <MenuItem key={link.href} link={link} onNavigate={() => setMobileOpen(false)} />
          ))}
          <div className="mt-3 grid grid-cols-3 gap-1 border-t border-white/[0.07] pt-3">
            {SIMPLE_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="press rounded-lg px-3 py-2 text-center text-[13px] text-zinc-300 hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
