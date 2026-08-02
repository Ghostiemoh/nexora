"use client";

import { useMemo, useState } from "react";
import { Layers, Search, ChevronDown, ArrowDownWideNarrow, ArrowDownAZ } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { valueCounts } from "@/lib/auto-dashboard";

/** How many values to render before the "show all" control appears. Every value
 *  is counted regardless; this only bounds what is painted at once. */
const PAGE = 25;

interface CategoryColumn {
  name: string;
  type: string;
  distinct: number;
  filled: number;
  missing: number;
  values: { name: string; value: number }[];
}

/** A column has to repeat to be a category. Free-text notes and IDs are almost
 *  unique per row, so listing their values would be a wall of noise. */
const MAX_CATEGORIES = 2000;

/** Every column worth browsing as a set of categories: profiled categories and
 *  booleans, repeating text columns, and numeric codes with few values. */
function buildCategoryColumns(dataset: Dataset): CategoryColumn[] {
  const out: CategoryColumn[] = [];

  for (const p of dataset.profiles) {
    const filled = dataset.rows.length - p.missingCount;
    const repeats = p.uniqueCount <= MAX_CATEGORIES && p.uniqueCount < filled * 0.9;

    const isCategoryLike =
      p.type === "category" ||
      p.type === "boolean" ||
      (p.type === "string" && repeats) ||
      // Numeric codes (ratings, tiers, status ids) are categories in practice.
      (p.type === "number" && p.uniqueCount <= 25);

    if (!isCategoryLike || p.uniqueCount === 0) continue;

    out.push({
      name: p.name,
      type: p.type,
      distinct: p.uniqueCount,
      filled,
      missing: p.missingCount,
      values: valueCounts(dataset.rows, p.name),
    });
  }

  return out.sort((a, b) => a.distinct - b.distinct);
}

export function CategoryExplorer({ dataset }: { dataset: Dataset }) {
  const columns = useMemo(() => buildCategoryColumns(dataset), [dataset]);
  const [openColumn, setOpenColumn] = useState<string | null>(columns[0]?.name ?? null);

  if (columns.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
            Categories
          </h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            All {columns.length} categorical column{columns.length === 1 ? "" : "s"} in{" "}
            <span className="font-mono text-primary">{dataset.name}</span>, with the number of rows
            in every value.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {columns.map((column) => (
          <CategoryCard
            key={column.name}
            column={column}
            totalRows={dataset.rows.length}
            open={openColumn === column.name}
            onToggle={() =>
              setOpenColumn((current) => (current === column.name ? null : column.name))
            }
          />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({
  column,
  totalRows,
  open,
  onToggle,
}: {
  column: CategoryColumn;
  totalRows: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sortByCount, setSortByCount] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? column.values.filter((v) => v.name.toLowerCase().includes(needle))
      : column.values;
    return sortByCount
      ? matched
      : [...matched].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [column.values, query, sortByCount]);

  const visible = showAll ? filtered : filtered.slice(0, PAGE);
  const maxCount = column.values[0]?.value ?? 1;
  const panelId = `category-panel-${column.name.replace(/\W/g, "-")}`;

  return (
    <div className="nexora-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="press flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[13px] font-medium text-white">
            {column.name}
          </span>
          <span className="mt-0.5 block text-[11px] text-on-surface-variant">
            {column.type} · {column.filled.toLocaleString()} of {totalRows.toLocaleString()} rows
            filled
            {column.missing > 0 && ` · ${column.missing.toLocaleString()} missing`}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-primary">
          {column.distinct.toLocaleString()} categor{column.distinct === 1 ? "y" : "ies"}
        </span>
      </button>

      {open && (
        <div id={panelId} className="border-t border-white/[0.06] px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowAll(false);
                }}
                placeholder={`Search ${column.distinct.toLocaleString()} values`}
                aria-label={`Search values in ${column.name}`}
                className="h-9 w-full rounded-lg border border-white/10 bg-black/25 pl-8 pr-3 text-xs text-white outline-none placeholder:text-on-surface-variant/70 focus:border-primary/50"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortByCount((s) => !s)}
              className="press flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[11.5px] text-on-surface-variant transition-colors hover:text-on-surface"
            >
              {sortByCount ? (
                <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {sortByCount ? "By count" : "A to Z"}
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-xs text-on-surface-variant">
              No value matches &quot;{query}&quot;.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((v) => {
                const share = column.filled > 0 ? (v.value / column.filled) * 100 : 0;
                return (
                  <li key={v.name} className="flex items-center gap-3">
                    <span
                      className="min-w-0 flex-1 truncate text-[12.5px] text-on-surface"
                      title={v.name}
                    >
                      {v.name}
                    </span>
                    <span className="relative h-2 w-24 shrink-0 overflow-hidden rounded-full bg-black/40 sm:w-40">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, (v.value / maxCount) * 100)}%` }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right text-[12px] font-medium tabular-nums text-white">
                      {v.value.toLocaleString()}
                    </span>
                    <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-on-surface-variant">
                      {share.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > PAGE && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="press mt-3 w-full cursor-pointer rounded-lg border border-white/10 py-2 text-[12px] text-on-surface-variant transition-colors hover:bg-white/[0.04] hover:text-on-surface"
            >
              {showAll
                ? `Show first ${PAGE}`
                : `Show all ${filtered.length.toLocaleString()} values`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
