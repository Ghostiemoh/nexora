"use client";

import { useMemo, useState } from "react";
import { Replace, Columns3, ChevronDown } from "lucide-react";
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

/** The Excel-pain toolbar: Find & Replace and Text to Columns, both flowing
 *  through the normal fix pipeline (recorded in the recipe, undoable). */
export function TransformTools({ dataset }: { dataset: Dataset }) {
  const applyFix = useNexora((s) => s.applyFix);
  const [open, setOpen] = useState<"replace" | "split" | null>(null);

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

  const toggle = (panel: "replace" | "split") =>
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
              <div className="grid grid-cols-2 gap-2">
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
              <div className="grid grid-cols-2 gap-2">
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
      </div>
    </div>
  );
}
