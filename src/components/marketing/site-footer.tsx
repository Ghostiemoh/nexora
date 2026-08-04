"use client";

import Link from "next/link";

/* Every href below resolves to a page that exists. Where a section would only
 * have had a placeholder behind it, the link is not here at all. */
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Dataset Doctor", href: "/dataset-doctor" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Reports", href: "/reports" },
      { label: "SQL Lab", href: "/sql-lab" },
      { label: "Pivot Table", href: "/pivot" },
      { label: "OCR Center", href: "/ocr-center" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Changelog", href: "/changelog" },
      { label: "Security", href: "/security" },
      { label: "Support desk", href: "/support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/company" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 select-none border-t border-white/5 bg-background">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" aria-hidden />

      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2 md:pr-8">
            <Link href="/" className="mb-4 flex w-fit items-center gap-2.5">
              <svg className="h-7 w-7" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                <path d="M40 60V140L100 175L160 140V60L100 25L40 60Z" stroke="#c0c1ff" strokeWidth="12" strokeLinejoin="round" />
                <path d="M100 25L40 60L100 95L160 60L100 25Z" fill="#c0c1ff" fillOpacity="0.2" stroke="#c0c1ff" strokeWidth="8" strokeLinejoin="round" />
                <circle cx="100" cy="100" r="15" fill="#c0c1ff" />
              </svg>
              <span className="text-sm font-semibold tracking-tight text-white">Nexora</span>
            </Link>
            <p className="mb-5 max-w-xs text-[13px] leading-relaxed text-on-surface-variant">
              The local-first analytics workspace. Clean the data, read what it says, and write the
              report, without any of it leaving your machine.
            </p>

            {/* No newsletter form: there is no server to receive an address, so
                a signup box would be a control that quietly does nothing. */}
            <Link
              href="/launch"
              className="pill h-10 w-fit bg-white/[0.06] px-4 text-[13px] text-white hover:bg-white/[0.1]"
            >
              Open the workspace
            </Link>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="mb-4 text-[11px] uppercase tracking-wider text-zinc-500">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="cursor-pointer text-[13px] text-on-surface-variant transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 sm:flex-row">
          <p className="text-[13px] text-zinc-500">
            © {new Date().getFullYear()} Nexora · Built in Nigeria, runs on your device
          </p>
          <a
            href="https://github.com/Ghostiemoh/nexora"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Nexora source on GitHub"
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[12.5px] text-zinc-500 transition-colors hover:border-primary/20 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            Source on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
