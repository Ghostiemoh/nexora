"use client";

/* The investigation workspace.
 *
 * Dataset Doctor used to offer two answers to every finding: fix it, or mark it
 * intentional. Both close the question. This panel opens it instead, because a
 * column that is 34% empty is the beginning of an analysis and not a chore.
 *
 * The design rule that matters most here is that evidence is never flattened.
 * "37% of missing rows are LATAM" is counted, "that gap is unlikely to be
 * chance" is a test result, and "the export probably broke" is a guess. Those
 * three carry completely different weight and the panel renders them
 * differently, so no one can skim it and come away believing a hypothesis was
 * a measurement. Fix and Mark intentional are still here, at the end, as
 * conclusions you reach rather than the only two things you can do. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  X,
  Eye,
  FlaskConical,
  Sparkles,
  Ruler,
  Lightbulb,
  ArrowRight,
  TableProperties,
  Layers,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { analyzeMissingness, type EvidenceStrength } from "@/lib/missingness";
import { analyzeOutliers } from "@/lib/outliers";
import type { Dataset } from "@/lib/types";
import { MODAL_BACKDROP } from "@/components/layout/layers";

export type InvestigationKind = "missing" | "outlier";

/* Each strength gets its own shape, not just its own colour. Colour alone
 * would fail for anyone who cannot separate the hues, and the difference
 * between a fact and a guess is exactly the thing that must survive that. */
const STRENGTH: Record<
  EvidenceStrength,
  { label: string; icon: typeof Eye; className: string; iconClass: string }
> = {
  observed: {
    label: "Counted",
    icon: Ruler,
    className: "border-l-2 border-l-sky-400/70 bg-sky-400/[0.05]",
    iconClass: "text-sky-300",
  },
  supported: {
    label: "Statistically supported",
    icon: FlaskConical,
    className: "border-l-2 border-l-emerald-400/70 bg-emerald-400/[0.05]",
    iconClass: "text-emerald-300",
  },
  hypothesis: {
    label: "Hypothesis, unverified",
    icon: Lightbulb,
    className: "border-l-2 border-dashed border-l-amber-400/70 bg-amber-400/[0.04]",
    iconClass: "text-amber-300",
  },
};

function EvidenceRow({ strength, text }: { strength: EvidenceStrength; text: string }) {
  const style = STRENGTH[strength];
  const Icon = style.icon;
  return (
    <li className={`flex gap-3 rounded-r-lg px-3.5 py-3 ${style.className}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.iconClass}`}>
          {style.label}
        </span>
        <p className="mt-1 text-[12.5px] leading-relaxed text-on-surface">{text}</p>
      </div>
    </li>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Eye; children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {children}
    </h3>
  );
}

export function InvestigationPanel({
  dataset,
  column,
  kind,
  onClose,
}: {
  dataset: Dataset;
  column: string;
  kind: InvestigationKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const askAnalyst = useNexora((s) => s.askAnalyst);
  const hasKey = useNexora((s) => s.settings.geminiApiKey.length > 0);
  const [showRows, setShowRows] = useState(false);

  const missing = useMemo(
    () => (kind === "missing" ? analyzeMissingness(dataset, column) : null),
    [dataset, column, kind]
  );
  const outlier = useMemo(
    () => (kind === "outlier" ? analyzeOutliers(dataset, column) : null),
    [dataset, column, kind]
  );

  const evidence = missing?.evidence ?? [];
  const questions = missing?.questions ?? outlier?.questions ?? [];

  const ask = (question: string) => {
    askAnalyst(question);
    router.push("/workspace");
  };

  const headline =
    kind === "missing"
      ? `${missing?.missingPct ?? 0}% of ${column} is empty`
      : `${outlier?.count ?? 0} extreme value${outlier?.count === 1 ? "" : "s"} in ${column}`;

  const verdictLabel =
    kind === "missing"
      ? { MAR: "Missing At Random", MCAR: "Consistent with MCAR", none: "Nothing to investigate" }[
          missing?.verdict ?? "none"
        ]
      : "No verdict, by design";

  return (
    <div
      className={`${MODAL_BACKDROP} items-start sm:p-6`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="investigation-title"
        className="nexora-card my-auto w-full max-w-3xl overflow-hidden"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
          <div className="min-w-0">
            <p className="text-label text-primary">Investigation</p>
            <h2
              id="investigation-title"
              className="mt-1 text-xl font-semibold tracking-tight text-on-surface"
            >
              {headline}
            </h2>
            <p className="mt-1.5 text-[12px] text-on-surface-variant">
              {kind === "missing"
                ? `${missing?.missingCount.toLocaleString()} of ${dataset.rows.length.toLocaleString()} rows · ${verdictLabel}`
                : `${outlier?.pct}% of values · outside ${outlier?.lowerFence.toLocaleString()} to ${outlier?.upperFence.toLocaleString()} (1.5 × IQR)`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close investigation"
            className="press flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </header>

        <div className="max-h-[calc(100vh-13rem)] space-y-6 overflow-y-auto px-6 py-5">
          {/* ── Missing: the evidence chain ── */}
          {kind === "missing" && evidence.length > 0 && (
            <section>
              <SectionTitle icon={FlaskConical}>What the data shows</SectionTitle>
              <ul className="space-y-1.5">
                {evidence.map((e, i) => (
                  <EvidenceRow key={i} strength={e.strength} text={e.text} />
                ))}
              </ul>
            </section>
          )}

          {/* ── Missing: association table ── */}
          {missing && missing.associations.length > 0 && (
            <section>
              <SectionTitle icon={Layers}>Where the gaps sit</SectionTitle>
              <div className="overflow-x-auto rounded-lg border border-white/[0.07]">
                <table className="w-full min-w-[30rem] text-left text-[12px]">
                  <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-on-surface-variant">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Column</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Segment</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Of missing</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Of complete</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Effect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {missing.associations.map((a) => (
                      <tr key={`${a.column}-${a.segment}`}>
                        <td className="px-3 py-2 font-mono text-on-surface-variant">{a.column}</td>
                        <td className="px-3 py-2 font-medium text-on-surface">{a.segment}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                          {a.missingShare}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">
                          {a.presentShare}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">
                          V {a.cramersV.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant/80">
                Cramér&apos;s V is the effect size, from 0 to 1. It is independent of how many rows
                you have, which is why it ranks these rather than the p-value: with enough rows,
                almost anything is significant.
              </p>
            </section>
          )}

          {/* ── Outlier: the competing readings ── */}
          {outlier && outlier.readings.length > 0 && (
            <section>
              <SectionTitle icon={Lightbulb}>How to read these</SectionTitle>
              <p className="mb-3 text-[12px] leading-relaxed text-on-surface-variant">
                Nexora will not tell you these values are wrong, because the distribution cannot
                know that. Each reading below fits the shape of your data. The check is how you
                tell them apart.
              </p>
              <ul className="space-y-2">
                {outlier.readings.map((r) => (
                  <li key={r.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <p className="text-[13px] font-semibold text-on-surface">{r.label}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
                      {r.rationale}
                    </p>
                    <p className="mt-2 flex gap-2 text-[12px] leading-relaxed text-primary">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{r.check}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Outlier: segments and contrasts ── */}
          {outlier && outlier.segments.length > 0 && (
            <section>
              <SectionTitle icon={Layers}>Which groups they land in</SectionTitle>
              <ul className="space-y-1.5">
                {outlier.segments.map((s) => (
                  <li
                    key={`${s.column}-${s.segment}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-white/[0.07] px-3.5 py-2.5 text-[12px]"
                  >
                    <span className="text-on-surface">
                      <span className="font-mono text-on-surface-variant">{s.column}</span>
                      {" = "}
                      <span className="font-medium">{s.segment}</span>
                    </span>
                    <span className="tabular-nums text-on-surface-variant">
                      <span className="font-semibold text-amber-300">{s.outlierRate}%</span> extreme,
                      against {s.baseRate}% overall
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {outlier && outlier.contrasts.length > 0 && (
            <section>
              <SectionTitle icon={TableProperties}>How they differ elsewhere</SectionTitle>
              <div className="overflow-x-auto rounded-lg border border-white/[0.07]">
                <table className="w-full min-w-[26rem] text-left text-[12px]">
                  <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-on-surface-variant">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Column</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Extreme rows</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Everything else</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Ratio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {outlier.contrasts.map((c) => (
                      <tr key={c.column}>
                        <td className="px-3 py-2 font-mono text-on-surface-variant">{c.column}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-on-surface">
                          {c.outlierMean.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">
                          {c.normalMean.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">
                          {c.ratio === null ? "—" : `${c.ratio.toFixed(2)}×`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Outlier: the actual records ── */}
          {outlier && outlier.records.length > 0 && (
            <section>
              <SectionTitle icon={Eye}>The records themselves</SectionTitle>
              <button
                type="button"
                onClick={() => setShowRows((s) => !s)}
                aria-expanded={showRows}
                className="press cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-on-surface hover:bg-white/[0.05]"
              >
                {showRows ? "Hide" : `Inspect ${outlier.records.length} row(s)`}
              </button>
              {showRows && (
                <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/[0.07]">
                  <table className="w-full text-left text-[11.5px]">
                    <thead className="sticky top-0 bg-surface-container text-[10px] uppercase tracking-wider text-on-surface-variant">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Row</th>
                        {dataset.columns.slice(0, 6).map((c) => (
                          <th key={c} scope="col" className="px-3 py-2 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {outlier.records.map((r) => (
                        <tr key={r.rowIndex} className="hover:bg-white/[0.03]">
                          <td className="px-3 py-1.5 font-mono text-on-surface-variant">
                            {r.rowIndex + 1}
                          </td>
                          {dataset.columns.slice(0, 6).map((c) => (
                            <td
                              key={c}
                              className={`px-3 py-1.5 tabular-nums ${
                                c === column ? "font-semibold text-amber-300" : "text-on-surface-variant"
                              }`}
                            >
                              {String(dataset.rows[r.rowIndex]?.[c] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── Hand it to the analyst ── */}
          {questions.length > 0 && (
            <section>
              <SectionTitle icon={Sparkles}>Ask the analyst</SectionTitle>
              {!hasKey && (
                <p className="mb-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11.5px] leading-relaxed text-on-surface-variant">
                  These open the AI Analyst with the question already written. Answering them needs a
                  Gemini key, which you can add in Settings. Everything above was computed here and
                  needs no key.
                </p>
              )}
              <ul className="space-y-1.5">
                {questions.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => ask(q)}
                      className="press group flex w-full cursor-pointer items-start gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.06]"
                    >
                      <Sparkles
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="text-[12.5px] leading-relaxed text-on-surface">{q}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </motion.section>
    </div>
  );
}
