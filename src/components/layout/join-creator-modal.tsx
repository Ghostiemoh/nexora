"use client";

import { useState, useEffect } from "react";
import { X, GitBranch, ArrowRight, Info, AlertTriangle } from "lucide-react";
import { useNexora } from "@/lib/store";
import { useRouter } from "next/navigation";

interface JoinCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinCreatorModal({ isOpen, onClose }: JoinCreatorModalProps) {
  const router = useRouter();
  const datasets = useNexora((s) => s.datasets);
  const activeId = useNexora((s) => s.activeId);
  const joinDatasetsAction = useNexora((s) => s.joinDatasets);

  const initialLeftId = activeId || datasets[0]?.id || "";
  const initialRightId = datasets.find((d) => d.id !== initialLeftId)?.id || "";

  const [leftId, setLeftId] = useState(initialLeftId);
  const [rightId, setRightId] = useState(initialRightId);

  const leftDs = datasets.find((d) => d.id === leftId);
  const rightDs = datasets.find((d) => d.id === rightId);

  const [leftKey, setLeftKey] = useState(() => leftDs?.columns[0] || "");
  const [rightKey, setRightKey] = useState(() => rightDs?.columns[0] || "");
  const [joinType, setJoinType] = useState<"inner" | "left" | "right" | "full">("inner");
  
  const [outputName, setOutputName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the join keys and output name whenever the chosen tables change.
  useEffect(() => {
    if (leftDs) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeftKey(leftDs.columns[0] || "");
    }
  }, [leftId, leftDs]);

  useEffect(() => {
    if (rightDs) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRightKey(rightDs.columns[0] || "");
    }
  }, [rightId, rightDs]);

  useEffect(() => {
    if (leftDs && rightDs) {
      const cleanLeft = leftDs.name.replace(/\.[^/.]+$/, "");
      const cleanRight = rightDs.name.replace(/\.[^/.]+$/, "");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOutputName(`${cleanLeft}_joined_${cleanRight}`);
    }
  }, [leftId, rightId, leftDs, rightDs]);

  // Guards live after all hooks so hook order stays stable across renders.
  if (!isOpen || datasets.length < 2) return null;

  // Identify colliding columns
  const collidingCols = leftDs && rightDs
    ? leftDs.columns.filter((c) => rightDs.columns.includes(c) && c !== leftKey && c !== rightKey)
    : [];

  const handleMerge = () => {
    setError(null);
    if (!leftId || !rightId || !leftKey || !rightKey || !outputName) {
      setError("Please fill out all join configurations.");
      return;
    }
    if (leftId === rightId) {
      setError("Cannot join a dataset with itself.");
      return;
    }

    try {
      const newId = joinDatasetsAction(outputName, leftId, rightId, leftKey, rightKey, joinType);
      if (newId.startsWith("Error") || newId === "Dataset not found") {
        setError(newId);
      } else {
        router.push("/workspace");
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute join operation.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-surface border border-outline-variant rounded-xl flex flex-col max-h-[90vh] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low shrink-0">
          <div className="flex items-center gap-2 text-primary">
            <GitBranch className="w-5 h-5" />
            <h3 className="font-headline-md text-[18px] font-semibold text-white">
              Relational Join Creator
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 text-error rounded-lg text-body-md">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Table Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Table Selector */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Left Dataset (Primary)
              </label>
              <select
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-md focus:outline-none focus:border-primary"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              {leftDs && (
                <div className="space-y-2">
                  <label className="text-[11px] font-mono text-zinc-500 uppercase">Join Key Column</label>
                  <select
                    value={leftKey}
                    onChange={(e) => setLeftKey(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant rounded-md p-2 text-on-surface text-body-md focus:outline-none"
                  >
                    {leftDs.columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Right Table Selector */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Right Dataset (Secondary)
              </label>
              <select
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-md focus:outline-none focus:border-primary"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              {rightDs && (
                <div className="space-y-2">
                  <label className="text-[11px] font-mono text-zinc-500 uppercase">Join Key Column</label>
                  <select
                    value={rightKey}
                    onChange={(e) => setRightKey(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant rounded-md p-2 text-on-surface text-body-md focus:outline-none"
                  >
                    {rightDs.columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Join Type Cards */}
          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider block">
              Join Mode
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { type: "inner", title: "Inner Join", desc: "Only matching rows from both tables." },
                { type: "left", title: "Left Outer", desc: "All left rows plus matching right rows." },
                { type: "right", title: "Right Outer", desc: "All right rows plus matching left rows." },
                { type: "full", title: "Full Outer", desc: "All rows from both tables, padded with nulls." },
              ].map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setJoinType(item.type as "inner" | "left" | "right" | "full")}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between h-32 transition-[color,background-color,border-color,box-shadow,transform,opacity] cursor-pointer ${
                    joinType === item.type
                      ? "border-primary bg-primary/5 shadow-[0_0_15px_rgba(192,193,255,0.1)]"
                      : "border-outline-variant bg-surface-container-low/40 hover:border-outline-variant/80"
                  }`}
                >
                  <span className="text-body-md font-bold text-white">{item.title}</span>
                  <span className="text-[11px] text-on-surface-variant leading-relaxed mt-2">
                    {item.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Output Name */}
          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">
              Output Dataset Name
            </label>
            <input
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-md focus:outline-none focus:border-primary"
              placeholder="Enter result table name..."
            />
          </div>

          {/* Colliding Column Warnings */}
          {collidingCols.length > 0 && (
            <div className="flex gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg text-body-md">
              <Info className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Schema Field Collision Warning</span>
                <span className="text-zinc-400 text-sm leading-relaxed">
                  The columns <span className="font-mono text-yellow-300">{collidingCols.join(", ")}</span> exist in both datasets. They will be auto-aliased with <span className="font-mono text-zinc-300">_left</span> and <span className="font-mono text-zinc-300">_right</span> suffixes in the result.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant/60 bg-surface-container-lowest flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-outline-variant rounded-lg text-on-surface-variant hover:text-white transition-colors text-body-md font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            className="px-5 py-2 bg-primary text-on-primary rounded-lg text-body-md font-bold hover:bg-primary-fixed transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            Execute Join
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
