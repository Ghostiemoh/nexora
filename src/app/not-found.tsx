import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

const ROUTES = [
  { label: "Datasets", href: "/launch", detail: "Start here: pick or load a file" },
  { label: "Dataset Doctor", href: "/dataset-doctor", detail: "Data quality and fixes" },
  { label: "Dashboard", href: "/dashboard", detail: "KPIs, trends, breakdowns" },
  { label: "Reports", href: "/reports", detail: "The written analysis" },
  { label: "Documentation", href: "/docs", detail: "How everything works" },
  { label: "Home", href: "/", detail: "Back to the front page" },
];

/** A 404 that actually helps. The marketing site used to answer every unknown
 *  path with the landing page, which hid broken links instead of reporting
 *  them; this says plainly that the page is not there and offers the map. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-20 text-foreground">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Compass className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-on-surface-variant">
            404
          </span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          That page does not exist
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-on-surface-variant">
          The address you followed is not a page in Nexora. Nothing was lost: your datasets live in
          this browser and are still where you left them.
        </p>

        <ul className="mt-8 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07]">
          {ROUTES.map((route) => (
            <li key={route.href}>
              <Link
                href={route.href}
                className="press group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-white/[0.04]"
              >
                <span>
                  <span className="block text-[14px] font-medium text-white">{route.label}</span>
                  <span className="block text-[12.5px] text-on-surface-variant">{route.detail}</span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
