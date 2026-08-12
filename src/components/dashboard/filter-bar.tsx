"use client";

import { useState } from "react";
import { ChevronDown, FilterX, SlidersHorizontal } from "lucide-react";
import type { DashboardFilter } from "@/lib/dashboard";
import { Z_POPOVER } from "@/components/layout/layers";

export interface FilterBarProps {
  filters: DashboardFilter[];
  /** column → the values currently ticked; an empty array means "all" */
  selections: Record<string, string[]>;
  onChange: (selections: Record<string, string[]>) => void;
  /** rows visible under the current selection, and the total */
  visible: number;
  total: number;
}

/** The dashboard's filter bar. Only dimensions the dataset actually supports
 *  appear here, and clearing everything is always one click away. */
export function FilterBar({ filters, selections, onChange, visible, total }: FilterBarProps) {
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  if (filters.length === 0) return null;

  const activeCount = Object.values(selections).filter((v) => v.length > 0).length;

  const toggle = (column: string, value: string) => {
    const current = selections[column] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...selections, [column]: next });
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
      <span className="flex items-center gap-1.5 pl-1 pr-1 text-[11px] uppercase tracking-wider text-on-surface-variant">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filters
      </span>

      {filters.map((filter) => {
        const chosen = selections[filter.column] ?? [];
        const open = openColumn === filter.column;
        return (
          <div key={filter.column} className="relative">
            <button
              type="button"
              onClick={() => setOpenColumn(open ? null : filter.column)}
              aria-expanded={open}
              className={`press flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12.5px] transition-colors ${
                chosen.length > 0
                  ? "border-primary/35 bg-primary/12 text-primary"
                  : "border-white/10 bg-white/[0.03] text-on-surface-variant hover:bg-white/[0.07] hover:text-on-surface"
              }`}
            >
              {filter.label}
              {chosen.length > 0 && (
                <span className="tabular-nums">({chosen.length})</span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div className={`menu-panel absolute left-0 top-11 ${Z_POPOVER} max-h-64 w-56 overflow-y-auto rounded-xl p-1.5`}>
                {filter.values.map((value) => {
                  const checked = chosen.includes(value);
                  return (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-on-surface hover:bg-white/[0.06]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(filter.column, value)}
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--primary)]"
                      />
                      <span className="truncate" title={value}>
                        {value}
                      </span>
                    </label>
                  );
                })}
                {chosen.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...selections, [filter.column]: [] })}
                    className="press mt-1 w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[11.5px] text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
                  >
                    Clear {filter.label}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="ml-auto flex items-center gap-2.5 pr-1">
        <span className="font-mono text-[11px] tabular-nums text-on-surface-variant">
          {visible.toLocaleString("en-US")} of {total.toLocaleString("en-US")} rows
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="press flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface"
          >
            <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
