"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Dataset Doctor", href: "/dashboard" },
      { label: "AI Analyst", href: "/workspace" },
      { label: "SQL Lab", href: "/sql-lab" },
      { label: "OCR Center", href: "/ocr-center" },
      { label: "Reports", href: "/reports" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Support", href: "/support" },
      { label: "Security", href: "/privacy" },
      { label: "Changelog", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/company" },
      { label: "Team", href: "/team" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "/support" },
    ],
  },
];

function Social({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      className="w-9 h-9 rounded-lg border border-white/5 bg-white/[0.02] flex items-center justify-center text-zinc-500 hover:text-white hover:border-primary/20 transition-colors cursor-pointer"
    >
      {children}
    </a>
  );
}

export function SiteFooter() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <footer className="relative z-10 border-t border-white/5 bg-background select-none">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" aria-hidden />

      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10">
          {/* brand + newsletter */}
          <div className="col-span-2 md:pr-8">
            <Link href="/" className="flex items-center gap-2.5 mb-4 w-fit">
              <svg className="w-7 h-7" viewBox="0 0 200 200" fill="none">
                <path d="M40 60V140L100 175L160 140V60L100 25L40 60Z" stroke="#c0c1ff" strokeWidth="12" strokeLinejoin="round" />
                <path d="M100 25L40 60L100 95L160 60L100 25Z" fill="#c0c1ff" fillOpacity="0.2" stroke="#c0c1ff" strokeWidth="8" strokeLinejoin="round" />
                <circle cx="100" cy="100" r="15" fill="#c0c1ff" />
              </svg>
              <span className="text-sm font-semibold text-white tracking-tight">Nexora</span>
            </Link>
            <p className="text-[13px] text-on-surface-variant leading-relaxed max-w-xs mb-5">
              The analytics OS. Upload your data and get decisions, with cleaning, analysis, and
              reporting in one place.
            </p>

            <form
              className="max-w-xs"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) setSent(true);
              }}
            >
              <label htmlFor="footer-email" className="text-[11px] text-zinc-500 uppercase tracking-wider">
                Product updates
              </label>
              <div className="mt-2 flex items-center gap-2 bg-surface-container-lowest border border-white/10 rounded-lg pl-3 pr-1 h-11 focus-within:border-primary/40 transition-colors">
                <input
                  id="footer-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSent(false);
                  }}
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="flex-1 bg-transparent text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Subscribe"
                  className="pressable w-8 h-8 rounded-md bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container transition-colors cursor-pointer shrink-0"
                >
                  {sent ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
              {sent && (
                <p role="status" className="mt-2 text-[12px] text-primary">
                  You are on the list.
                </p>
              )}
            </form>
          </div>

          {/* link columns */}
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider mb-4">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-on-surface-variant hover:text-white transition-colors cursor-pointer"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-zinc-500">© 2026 Nexora Analytics Inc. · Lagos / Remote</p>
          <div className="flex items-center gap-2">
            <Social href="#" label="Nexora on X">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </Social>
            <Social href="#" label="Nexora on GitHub">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </Social>
            <Social href="#" label="Nexora on LinkedIn">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </Social>
          </div>
        </div>
      </div>
    </footer>
  );
}
