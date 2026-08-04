"use client";

import { useMemo, useState } from "react";
import { Replace, Columns3, ChevronDown, Scissors } from "lucide-react";
import type { Dataset, CleanOp } from "@/lib/types";
import { useNexora } from "@/lib/store";
import { previewCleanOp } from "@/lib/recipe";

const DELIMITER_PRESETS = [
  { label: "Comma ( , )", value: "," },
  { label: "Semicolon ( ; )", value: ";" },
  { label: "Space", value: " " },
  { label: "Dash ( - )", value: "-" },
  { label: "Slash ( / )", value: "/" },
  { label: "Pipe ( | )", value: "|" },
  { label: "Custom…", value: "__custom__" },
];

/** The Excel-pain toolbar: Find & Replace, Text to Columns, and outlier
 *  treatment, all flowing through the normal fix pipeline (recorded in the
 *  recipe, undoable). */
export function TransformTools({ dataset }: { dataset: Dataset }) {
  const applyFix = useNexora((s) => s.applyFix);
  const [open, setOpen] = useState<"replace" | "split" | "outliers" | null>(null);

  /* Find & Replace state */
  const [frColumn, setFrColumn] = useState<string>("__all__");
  const [frFind, setFrFind] = useState("");
  const [frReplace, setFrReplace] = useState("");
  const [frMatchCase, setFrMatchCase] = useState(false);

  /* Text to Columns state */
  const textColumns = dataset.profiles
    .filter((p) => p.type === "string" || p.type === "category")
    .map((p) => p.name);
  const [spColumn, setSpColumn] = useState<string>(textColumns[0] ?? "");
  const [spPreset, setSpPreset] = useState<string>(",");
  const [spCustom, setSpCustom] = useState("");
  const [spKeep, setSpKeep] = useState(false);

  const frOp: CleanOp | null = useMemo(() => {
    if (frFind === "") return null;
    return {
      kind: "findReplace",
      column: frColumn === "__all__" ? null : frColumn,
      find: frFind,
      replace: frReplace,
      matchCase: frMatchCase,
    };
  }, [frColumn, frFind, frReplace, frMatchCase]);

  const frPreview = useMemo(
    () => (frOp ? previewCleanOp(dataset.rows, frOp) : null),
    [dataset, frOp]
  );

  const spDelimiter = spPreset === "__custom__" ? spCustom : spPreset;
  const spOp: CleanOp | null = useMemo(() => {
    if (!spColumn || spDelimiter === "") return null;
    return { kind: "splitColumn", column: spColumn, delimiter: spDelimiter, keepOriginal: spKeep };
  }, [spColumn, spDelimiter, spKeep]);

  /* Sample split of the first non-empty cell, so users see what they'll get. */
  const spSample = useMemo(() => {
    if (!spColumn || spDelimiter === "") return null;
    const cell = dataset.rows
      .map((r) => r[spColumn])
      .find((v) => typeof v === "string" && v.includes(spDelimiter));
    if (typeof cell !== "string") return null;
    return cell.split(spDelimiter).map((p) => p.trim());
  }, [dataset, spColumn, spDelimiter]);

  /* Outlier treatment state. Only columns that actually have values beyond the
     fences are offered, so the picker never lists a column with nothing to do. */
  const outlierColumns = dataset.profiles
    .filter((p) => p.type === "number" && (p.outlierCount ?? 0) > 0)
    .map((p) => p.name);
  const [olColumn, setOlColumn] = useState("");
  const [olMode, setOlMode] = useState<"cap" | "drop">("cap");

  // Falls back to the first affected column, so cleaning away the selected
  // one leaves a valid choice rather than an empty picker.
  const activeOlColumn = outlierColumns.includes(olColumn) ? olColumn : (outlierColumns[0] ?? "");
  const olProfile = dataset.profiles.find((p) => p.name === activeOlColumn);
  const olKind = olMode === "cap" ? "capOutliers" : "dropOutlierRows";
  const olOp: CleanOp | null = activeOlColumn ? { kind: olKind, column: activeOlColumn } : null;

  // Left to the compiler to memoize: the column falls back to a derived value,
  // which a manual dependency list cannot express without defeating it.
  const olPreview = activeOlColumn
    ? previewCleanOp(dataset.rows, { kind: olKind, column: activeOlColumn })
    : null;

  const toggle = (panel: "replace" | "split" | "outliers") =>
    setOpen((prev) => (prev === panel ? null : panel));

  const inputCls =
    "bg-black/30 border border-white/10 rounded-lg text-xs text-white px-2.5 py-2 focus:border-primary/50 outline-none w-full";

  return (
    <div className="space-y-3">
      <h3 className="text-[13px] font-medium text-on-surface-variant px-1">Excel tools</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Find & Replace ── */}
        <div className="nexora-card p-4">
          <button
            type="button"
            onClick={() => toggle("replace")}
            className="w-full flex items-center justify-between cursor-pointer group"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <Replace className="w-4 h-4 text-primary" />
              Find &amp; Replace
            </span>
            <ChevronDown
              className={`w-4 h-4 text-on-surface-variant transition-transform ${open === "replace" ? "rotate-180" : ""}`}
            />
          </button>

          {open === "replace" && (
            <div className="mt-4 space-y-3">
              <select value={frColumn} onChange={(e) => setFrColumn(e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="__all__">All text columns</option>
                {dataset.columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={frFind}
                  onChange={(e) => setFrFind(e.target.value)}
                  placeholder="Find…"
                  className={inputCls}
                />
                <input
                  value={frReplace}
                  onChange={(e) => setFrReplace(e.target.value)}
                  placeholder="Replace with…"
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={frMatchCase}
                  onChange={(e) => setFrMatchCase(e.target.checked)}
                  className="accent-[#c0c1ff] cursor-pointer"
                />
                Match case
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-mono text-primary/80">
                  {frPreview
                    ? frPreview.changedCells > 0
                      ? `will change ${frPreview.changedCells} cell(s)`
                      : "no matches"
                    : "type something to find"}
                </span>
                <button
                  type="button"
                  disabled={!frOp || !frPreview || frPreview.changedCells === 0}
                  onClick={() => {
                    if (frOp) applyFix(dataset.id, frOp);
                    setFrFind("");
                    setFrReplace("");
                  }}
                  className="press px-4 py-2 rounded-lg bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  Replace all
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Text to Columns ── */}
        <div className="nexora-card p-4">
          <button
            type="button"
            onClick={() => toggle("split")}
            className="w-full flex items-center justify-between cursor-pointer group"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <Columns3 className="w-4 h-4 text-primary" />
              Text to Columns
            </span>
            <ChevronDown
              className={`w-4 h-4 text-on-surface-variant transition-transform ${open === "split" ? "rotate-180" : ""}`}
            />
          </button>

          {open === "split" && (
            <div className="mt-4 space-y-3">
              <select value={spColumn} onChange={(e) => setSpColumn(e.target.value)} className={`${inputCls} cursor-pointer`}>
                {textColumns.length === 0 && <option value="">No text columns</option>}
                {textColumns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select value={spPreset} onChange={(e) => setSpPreset(e.target.value)} className={`${inputCls} cursor-pointer`}>
                  {DELIMITER_PRESETS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                {spPreset === "__custom__" && (
                  <input
                    value={spCustom}
                    onChange={(e) => setSpCustom(e.target.value)}
                    placeholder="Delimiter…"
                    className={inputCls}
                  />
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={spKeep}
                  onChange={(e) => setSpKeep(e.target.checked)}
                  className="accent-[#c0c1ff] cursor-pointer"
                />
                Keep original column
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-mono text-primary/80 truncate" title={spSample?.join(" · ")}>
                  {spSample
                    ? `→ ${spSample.length} columns: ${spSample.slice(0, 3).join(" · ")}${spSample.length > 3 ? " …" : ""}`
                    : "no cell contains that delimiter"}
                </span>
                <button
                  type="button"
                  disabled={!spOp || !spSample}
                  onClick={() => {
                    if (spOp) applyFix(dataset.id, spOp);
                  }}
                  className="press px-4 py-2 rounded-lg bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  Split
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Outlier treatment ── */}
        <div className="nexora-card p-4">
          <button
            type="button"
            onClick={() => toggle("outliers")}
            className="w-full flex items-center justify-between cursor-pointer group"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <Scissors className="w-4 h-4 text-primary" />
              Outliers
            </span>
            <ChevronDown
              className={`w-4 h-4 text-on-surface-variant transition-transform ${open === "outliers" ? "rotate-180" : ""}`}
            />
          </button>

          {open === "outliers" && (
            <div className="mt-4 space-y-3">
              {outlierColumns.length === 0 ? (
                <p className="text-xs leading-relaxed text-on-surface-variant">
                  No numeric column has values beyond its 1.5×IQR fences. Nothing to treat.
                </p>
              ) : (
                <>
                  <select
                    value={activeOlColumn}
                    onChange={(e) => setOlColumn(e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    {outlierColumns.map((c) => {
                      const p = dataset.profiles.find((x) => x.name === c);
                      return (
                        <option key={c} value={c}>
                          {c} — {p?.outlierCount} beyond the fence
                        </option>
                      );
                    })}
                  </select>

                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Outlier treatment">
                    {(
                      [
                        ["cap", "Cap at fence"],
                        ["drop", "Remove rows"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setOlMode(mode)}
                        aria-pressed={olMode === mode}
                        className={`cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
                          olMode === mode
                            ? "border-primary/30 bg-primary/12 text-primary"
                            : "border-white/10 bg-black/20 text-on-surface-variant hover:bg-white/[0.05]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] leading-relaxed text-on-surface-variant">
                    {olMode === "cap"
                      ? "Winsorizing: extreme values are pulled onto the fence and every row survives, so counts stay comparable."
                      : "The whole row goes, including its other columns. Use it for records you know are wrong."}
                    {olProfile?.p25 !== undefined && olProfile.iqr !== undefined && (
                      <span className="ml-1 font-mono text-on-surface-variant/70">
                        Fence [{(olProfile.p25 - 1.5 * olProfile.iqr).toFixed(2)} …{" "}
                        {(olProfile.p75! + 1.5 * olProfile.iqr).toFixed(2)}]
                      </span>
                    )}
                  </p>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-mono text-primary/80">
                      {olPreview
                        ? olPreview.removedRows > 0
                          ? `will remove ${olPreview.removedRows} row(s)`
                          : olPreview.changedCells > 0
                            ? `will change ${olPreview.changedCells} cell(s)`
                            : "nothing to change"
                        : "pick a column"}
                    </span>
                    <button
                      type="button"
                      disabled={
                        !olOp ||
                        !olPreview ||
                        (olPreview.changedCells === 0 && olPreview.removedRows === 0)
                      }
                      onClick={() => {
                        if (olOp) applyFix(dataset.id, olOp);
                      }}
                      className="press px-4 py-2 rounded-lg bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      Apply
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
