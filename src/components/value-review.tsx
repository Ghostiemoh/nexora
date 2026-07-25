"use client";

import { useMemo, useState } from "react";
import { SearchCheck, CornerDownRight } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { useNexora } from "@/lib/store";

interface RareValue {
  column: string;
  value: string;
  count: number;
  /** most frequent values of the column, offered as merge targets */
  targets: string[];
}

/** Rare category values the auto-fixer couldn't safely merge (no close match),
 *  offered for manual reassignment — e.g. "Whig   April 4, 1841…" → "Whig". */
function findRareValues(dataset: Dataset): RareValue[] {
  const out: RareValue[] = [];
  for (const p of dataset.profiles) {
    const categoryLike =
      p.type === "category" || (p.type === "string" && p.uniqueCount >= 3 && p.uniqueCount <= 25);
    if (!categoryLike) continue;

    const counts = new Map<string, number>();
    for (const row of dataset.rows) {
      const v = row[p.name];
      if (v === null || v === undefined || String(v).trim() === "") continue;
      const key = String(v).trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length < 3 || sorted[0][1] < 3) continue;

    const targets = sorted.filter(([, c]) => c >= 3).map(([v]) => v).slice(0, 8);
    for (const [value, count] of sorted) {
      if (count <= 2 && !targets.includes(value)) {
        out.push({ column: p.name, value, count, targets });
      }
    }
  }
  return out.slice(0, 8);
}

export function ValueReview({ dataset }: { dataset: Dataset }) {
  const applyFix = useNexora((s) => s.applyFix);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const rare = useMemo(() => findRareValues(dataset), [dataset]);
  const visible = rare.filter((r) => !dismissed.has(`${r.column}:${r.value}`));

  if (visible.length === 0) return null;

  const handleMerge = (r: RareValue, target: string) => {
    const key = `${r.column}:${r.value}`;
    setPending(key);
    applyFix(dataset.id, { kind: "mergeValues", column: r.column, mapping: { [r.value]: target } });
    setPending(null);
  };

  const handleKeep = (r: RareValue) => {
    setDismissed((prev) => new Set(prev).add(`${r.column}:${r.value}`));
  };

  return (
    <div className="space-y-3">
      <h3 className="text-[13px] font-medium text-on-surface-variant px-1 flex items-center gap-2">
        <SearchCheck className="w-4 h-4" />
        Review odd values
        <span className="text-[11px] font-mono text-on-surface-variant/70">
          rare entries the auto-fixer left for you
        </span>
      </h3>
      <div className="space-y-2.5">
        {visible.map((r) => {
          const key = `${r.column}:${r.value}`;
          return (
            <div key={key} className="nexora-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-on-surface-variant">
                  <span className="font-mono text-primary">{r.column}</span> has {r.count} row(s) with
                </p>
                <p className="text-sm text-white font-mono truncate mt-0.5" title={r.value}>
                  &quot;{r.value}&quot;
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CornerDownRight className="w-4 h-4 text-on-surface-variant" />
                <select
                  defaultValue=""
                  disabled={pending === key}
                  onChange={(e) => {
                    if (e.target.value) handleMerge(r, e.target.value);
                  }}
                  className="bg-black/30 border border-white/10 rounded-lg text-xs text-white px-2.5 py-2 cursor-pointer focus:border-primary/50 outline-none max-w-[180px]"
                >
                  <option value="" disabled>
                    Reassign to…
                  </option>
                  {r.targets.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleKeep(r)}
                  className="press px-3 py-2 rounded-lg border border-white/10 text-on-surface-variant hover:text-white hover:bg-white/[0.06] text-[12px] cursor-pointer transition-colors"
                >
                  Keep as is
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
