"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { nextStep } from "@/lib/nav";

/** The end of a workflow page states where the analysis goes next, so nobody
 *  has to work out the order from the sidebar. Renders nothing on the last
 *  step, and nothing at all outside the workflow. */
export function NextStep({ note }: { note?: string }) {
  const pathname = usePathname();
  const step = nextStep(pathname);
  if (!step) return null;

  const Icon = step.icon;

  return (
    <Link
      href={step.href}
      className="press no-print group flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-primary/25 hover:bg-primary/[0.04]"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
            Step {step.step} · next
          </p>
          <p className="text-[14px] font-semibold text-white">{step.label}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant">
            {note ?? step.description}
          </p>
        </div>
      </div>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}
