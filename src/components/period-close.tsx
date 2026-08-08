"use client";

/* The monthly close: the moment Nexora notices that the file you just dropped
 * is another copy of one it has already cleaned, replays that cleanup, and tells
 * you what moved since last time. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, History, RefreshCw } from "lucide-react";
import { useNexora } from "@/lib/store";
import { findRecurringSource } from "@/lib/fingerprint";
import { diffPeriods } from "@/lib/period-diff";
import type { Dataset } from "@/lib/types";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function Chip({
  tone,
  children,
}: {
  tone: "neutral" | "warn";
  children: React.ReactNode;
}) {
  const styles =
    tone === "warn"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
      : "border-white/10 bg-white/[0.04] text-on-surface-variant";
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-wide ${styles}`}
    >
      {children}
    </span>
  );
}

/** What drifted between the two files, named rather than counted, since a
 *  renamed column is the thing that quietly changes a total. */
function DriftChips({
  added,
  missing,
  retyped,
}: {
  added: string[];
  missing: string[];
  retyped: { column: string; from: string; to: string }[];
}) {
  if (added.length === 0 && missing.length === 0 && retyped.length === 0) {
    return <Chip tone="neutral">schema identical</Chip>;
  }
  return (
    <>
      {retyped.map((r) => (
        <Chip key={`t-${r.column}`} tone="warn">
          {r.column}: {r.from} → {r.to}
        </Chip>
      ))}
      {missing.map((c) => (
        <Chip key={`m-${c}`} tone="warn">
          missing: {c}
        </Chip>
      ))}
      {added.map((c) => (
        <Chip key={`a-${c}`} tone="neutral">
          new: {c}
        </Chip>
      ))}
    </>
  );
}

function Stat({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-[10.5px] uppercase tracking-wider text-on-surface-variant/70">{label}</p>
      <p className="mt-1 font-mono text-[13px] text-white">
        {after}
        <span className="ml-1.5 text-[11px] text-on-surface-variant/70">was {before}</span>
      </p>
    </div>
  );
}

function CloseResult({ previous, current }: { previous: Dataset; current: Dataset }) {
  const diff = diffPeriods(previous, current);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat
          label="Rows"
          before={diff.rowsBefore.toLocaleString("en-US")}
          after={diff.rowsAfter.toLocaleString("en-US")}
        />
        <Stat label="Health" before={`${diff.healthBefore}%`} after={`${diff.healthAfter}%`} />
        <Stat
          label="Columns"
          before={previous.columns.length.toLocaleString("en-US")}
          after={current.columns.length.toLocaleString("en-US")}
        />
      </div>

      <div>
        <h4 className="text-[12px] font-semibold text-white">
          What changed since {diff.previousName}
        </h4>
        <ul className="mt-2 space-y-1.5">
          {diff.narrative.map((line, i) => (
            <li
              key={i}
              className="flex gap-2 text-[12.5px] leading-relaxed text-on-surface-variant"
            >
              <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Renders nothing unless the most recently touched dataset is recognizably a
 *  later copy of one that already carries a recipe. */
export function PeriodCloseCard() {
  const router = useRouter();
  const datasets = useNexora((s) => s.datasets);
  const applyRecipe = useNexora((s) => s.applyRecipe);
  const setActive = useNexora((s) => s.setActive);
  const [busy, setBusy] = useState(false);

  if (datasets.length < 2) return null;

  const target = [...datasets].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const found = findRecurringSource(target, datasets);
  if (!found) return null;

  const { dataset: source, match } = found;
  const steps = source.recipe?.length ?? 0;
  // A target that already carries ops has been cleaned: show the comparison
  // rather than inviting a second pass that would apply the same fixes twice.
  const alreadyClosed = (target.recipe?.length ?? 0) > 0;

  const runClose = () => {
    if (!source.recipe) return;
    setBusy(true);
    applyRecipe(target.id, source.recipe);
    setActive(target.id);
    setBusy(false);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="nexora-card border-primary/25 p-5"
      aria-label="Recurring file recognized"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10.5px] font-medium text-primary">
            {alreadyClosed ? (
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <History className="h-3 w-3" aria-hidden="true" />
            )}
            {alreadyClosed ? "Close complete" : "Recurring file recognized"}
          </span>

          <h2 className="mt-2 text-[15px] font-semibold text-white">
            {alreadyClosed ? (
              <>
                {target.name} was closed against {source.name}
              </>
            ) : (
              <>
                {target.name} looks like another copy of {source.name}
              </>
            )}
          </h2>

          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-on-surface-variant">
            {alreadyClosed ? (
              <>
                The {steps}-step cleanup recorded on {source.name} has been applied, so both files
                went through the identical sequence.
              </>
            ) : (
              <>
                {match.score}% schema match. {source.name} carries a {steps}-step cleanup that can
                replay here in one click, so this month goes through the identical sequence rather
                than a fresh set of judgement calls.
              </>
            )}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <DriftChips added={match.added} missing={match.missing} retyped={match.retyped} />
          </div>

          {match.retyped.length > 0 && !alreadyClosed && (
            <p className="mt-2.5 flex gap-2 text-[11.5px] leading-relaxed text-amber-200/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              A column changed type since last period. The cleanup still replays, but check that
              column before trusting a total on it.
            </p>
          )}
        </div>

        {!alreadyClosed && (
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={runClose}
              disabled={busy}
              className="pill h-9 bg-primary px-4 text-[12.5px] text-on-primary disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Run the close
            </button>
            <p className="max-w-[150px] text-[10.5px] leading-snug text-on-surface-variant/70">
              Replays {steps} recorded step{steps === 1 ? "" : "s"}. Undo is available afterwards.
            </p>
          </div>
        )}
      </div>

      {alreadyClosed && (
        <>
          <CloseResult previous={source} current={target} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActive(target.id);
                router.push("/dashboard");
              }}
              className="pill h-9 bg-primary px-4 text-[12.5px] text-on-primary"
            >
              Open the dashboard
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActive(target.id);
                router.push("/reports");
              }}
              className="press flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3.5 text-[12.5px] text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface"
            >
              Write the report
            </button>
          </div>
        </>
      )}
    </motion.section>
  );
}
