import { AlertTriangle } from "lucide-react";

/** Shown when an import hit the row cap. Warns that stats are computed on the
 *  first N rows only, which can bias results for sorted files. */
export function TruncationBanner({ rows }: { rows: number }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-amber-300"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-xs leading-relaxed">
        Only the first{" "}
        <span className="font-semibold tabular-nums">{rows.toLocaleString()}</span> rows were loaded
        (import cap). Profiling stats, charts, and query results all describe this sample. If the
        source file was sorted, they may not represent the full dataset.
      </p>
    </div>
  );
}
