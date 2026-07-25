import React from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground relative">
      {/* Calm ambient wash — one soft periwinkle glow up top */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[600px] z-0"
        style={{
          background:
            "radial-gradient(60% 70% at 50% -10%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
        }}
        aria-hidden
      />

      {/* Floating glass toolbar */}
      <header className="sticky top-0 z-50 px-4 pt-4 select-none">
        <div className="glass sheen max-w-3xl mx-auto h-14 rounded-full px-3 pl-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 press">
            <svg className="w-7 h-7" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M40 60V140L100 175L160 140V60L100 25L40 60Z" stroke="#c0c1ff" strokeWidth="12" strokeLinejoin="round" />
              <path d="M100 25L40 60L100 95L160 60L100 25Z" fill="#c0c1ff" fillOpacity="0.2" stroke="#c0c1ff" strokeWidth="8" strokeLinejoin="round" />
              <circle cx="100" cy="100" r="15" fill="#c0c1ff" />
            </svg>
            <span className="font-semibold text-[15px] text-white tracking-tight">Nexora</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-[13.5px] text-on-surface-variant">
            {[
              { label: "Features", href: "#features" },
              { label: "Free", href: "#pricing" },
              { label: "Docs", href: "/docs" },
              { label: "Company", href: "/company" },
            ].map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="press px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/dashboard"
            className="pill bg-white text-black h-9 px-4 text-[13.5px] font-semibold"
          >
            Launch
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col relative z-10">{children}</main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
