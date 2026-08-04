"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatKpiValue, type KpiSpec, type PeriodComparison } from "@/lib/kpi";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** A movement worth colouring. Below this, period noise is not news. */
const MATERIAL_DELTA = 0.5;

function DeltaBadge({ kpi }: { kpi: KpiSpec }) {
  if (kpi.deltaPct === undefined) return null;

  const flat = Math.abs(kpi.deltaPct) < MATERIAL_DELTA;
  const rising = kpi.deltaPct > 0;
  // Good news is not always "up": a rise in cost is a fall in health.
  const good = flat ? null : rising === kpi.higherIsBetter;
  const Icon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        good === null
          ? "bg-white/[0.06] text-on-surface-variant"
          : good
            ? "bg-emerald-400/10 text-emerald-300"
            : "bg-red-400/10 text-red-300"
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {flat ? "flat" : `${Math.abs(kpi.deltaPct).toFixed(1)}%`}
    </span>
  );
}

export function KpiRow({
  kpis,
  comparison,
  currency,
}: {
  kpis: KpiSpec[];
  comparison: PeriodComparison | null;
  currency: string | null;
}) {
  if (kpis.length === 0) return null;

  return (
    <section aria-label="Key performance indicators" className="space-y-2.5">
      <div
        className={`grid gap-4 ${
          kpis.length <= 3
            ? "grid-cols-1 sm:grid-cols-3"
            : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        }`}
      >
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.25), ease: EASE_OUT }}
            className="nexora-card p-4"
          >
            <p className="truncate text-[11.5px] text-on-surface-variant" title={kpi.label}>
              {kpi.label}
            </p>
            <p
              className="mt-1.5 truncate text-[22px] font-semibold leading-none tabular-nums text-white"
              title={kpi.value.toLocaleString("en-US")}
            >
              {formatKpiValue(kpi, currency)}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <DeltaBadge kpi={kpi} />
              <span
                className="truncate font-mono text-[10px] text-on-surface-variant/70"
                title={kpi.formula}
              >
                {kpi.formula}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* One caption for the whole row, so six tiles do not repeat the same
          sentence six times. */}
      {comparison && kpis.some((k) => k.deltaPct !== undefined) && (
        <p className="px-1 font-mono text-[11px] text-on-surface-variant/70">
          Change compares {comparison.currentLabel} against the {comparison.windowDays}-day window
          before it ({comparison.previousLabel}).
        </p>
      )}
    </section>
  );
}
