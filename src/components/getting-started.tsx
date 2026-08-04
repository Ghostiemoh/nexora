"use client";

import Link from "next/link";
import { Check, X, Compass, ArrowRight } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { useNexora } from "@/lib/store";

interface Step {
  id: string;
  title: string;
  /** what this step gets you, in one line */
  detail: string;
  done: boolean;
  action: { label: string; href: string };
}

/** The workflow tracker: dataset in, quality fixed, dashboard read, report out.
 *  Every step is checked off from real state, never from "you clicked the
 *  button", so the list cannot lie about progress. */
export function GettingStarted({ dataset }: { dataset: Dataset }) {
  const pinned = useNexora((s) => s.pinnedCharts[dataset.id]) ?? [];
  const exportHistory = useNexora((s) => s.exportHistory);
  const dismissed = useNexora((s) => s.onboardingDismissed);
  const dismissOnboarding = useNexora((s) => s.dismissOnboarding);

  if (dismissed) return null;

  const openIssues = dataset.diagnostics.filter((d) => d.severity === "warning").length;
  // How many of those the bulk button can actually take, so the promise here
  // matches what the button does when it is pressed.
  const autoIssues = dataset.diagnostics.filter((d) => d.fix && !d.fix.manual).length;
  const exported = exportHistory.some((e) => e.datasetId === dataset.id);

  const steps: Step[] = [
    {
      id: "load",
      title: "Load a dataset",
      detail: `${dataset.name} is loaded with ${dataset.rows.length.toLocaleString("en-US")} rows.`,
      done: true,
      action: { label: "Loaded", href: "/launch" },
    },
    {
      id: "clean",
      title: "Fix the data problems",
      detail:
        openIssues === 0
          ? "No open issues. The numbers downstream can be trusted."
          : autoIssues > 0
            ? `${openIssues} issue${openIssues === 1 ? "" : "s"} found. Auto-fix clears ${autoIssues} of them in one click.`
            : `${openIssues} issue${openIssues === 1 ? "" : "s"} left, each needing a call only you can make.`,
      done: openIssues === 0,
      action: { label: openIssues === 0 ? "Review quality" : "Fix them", href: "/dataset-doctor" },
    },
    {
      id: "chart",
      title: "Read the dashboard",
      detail:
        pinned.length > 0
          ? `${pinned.length} chart${pinned.length === 1 ? "" : "s"} pinned alongside the generated ones.`
          : "KPIs and charts are already chosen for this data. Change any of them.",
      done: pinned.length > 0,
      action: { label: pinned.length > 0 ? "Open dashboard" : "See the KPIs", href: "/dashboard" },
    },
    {
      id: "report",
      title: "Export your report",
      detail: exported
        ? "Report exported. It is listed in History & Audit."
        : "The full report is already written. Download it as PDF, Word, or Markdown.",
      done: exported,
      action: { label: exported ? "Export again" : "Get the report", href: "/reports" },
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const complete = doneCount === steps.length;

  return (
    <section className="nexora-ai-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
            {complete ? "You have done the full run" : "New here? Four steps to a finished report"}
          </h2>
          <p className="mt-0.5 text-[12px] text-on-surface-variant">
            {complete
              ? "Load the next file and repeat, or save this run as a workflow so it replays in one click."
              : "Each step opens the page that handles it."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-primary">
            {doneCount} of {steps.length}
          </span>
          <button
            type="button"
            onClick={dismissOnboarding}
            aria-label="Hide the getting started checklist"
            title="Hide this checklist"
            className="press flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface sm:h-7 sm:w-7"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={`flex flex-col rounded-xl border p-3.5 transition-colors ${
              step.done
                ? "border-emerald-400/25 bg-emerald-400/[0.06]"
                : "border-white/10 bg-black/20"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
                  step.done
                    ? "bg-emerald-400/20 text-emerald-300"
                    : "border border-primary/30 bg-primary/10 text-primary"
                }`}
              >
                {step.done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">
                {step.title}
              </span>
            </div>

            <p className="mt-1.5 flex-1 text-[11.5px] leading-relaxed text-on-surface-variant">
              {step.detail}
            </p>

            {step.id !== "load" && (
              <Link
                href={step.action.href}
                className="press mt-2.5 inline-flex w-fit cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-on-surface transition-colors hover:bg-white/[0.09]"
              >
                {step.action.label}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
