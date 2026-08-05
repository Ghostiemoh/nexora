"use client";

/* The shelves a pivot is built on.
 *
 * Drag a field in with a mouse, or add it from the shelf's own menu — the menu
 * is not a fallback, it is the path that works with a keyboard, on a phone, and
 * when a drag misses by four pixels. Every field on a shelf can be reordered
 * and removed without a modal in the way. */

import { GripVertical, Plus, X } from "lucide-react";
import type { Aggregation } from "@/lib/chart-recommend";
import { AGGREGATIONS } from "@/lib/chart-recommend";
import type { PivotValue } from "@/lib/pivot";

export const FIELD_MIME = "application/x-nexora-field";

export interface FieldChipProps {
  field: string;
  kind: "dimension" | "measure" | "date";
  onAdd?: () => void;
}

const KIND_STYLE: Record<string, string> = {
  measure: "border-primary/25 bg-primary/[0.09] text-primary",
  date: "border-sky-400/25 bg-sky-400/[0.08] text-sky-200",
  dimension: "border-white/10 bg-white/[0.04] text-on-surface-variant",
};

/** A field in the source list, draggable onto any shelf. */
export function FieldChip({ field, kind, onAdd }: FieldChipProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(FIELD_MIME, field);
        e.dataTransfer.setData("text/plain", field);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={`group flex cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11.5px] transition-colors active:cursor-grabbing ${KIND_STYLE[kind]}`}
    >
      <GripVertical className="h-3 w-3 shrink-0 opacity-40" aria-hidden="true" />
      <span className="min-w-0 truncate font-mono">{field}</span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${field} to the pivot`}
          title={`Add ${field}`}
          className="press ml-auto flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/10 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export interface ShelfProps {
  label: string;
  hint: string;
  /** fields already on this shelf */
  fields: string[];
  /** fields that could still be added */
  available: string[];
  onAdd: (field: string) => void;
  onRemove: (field: string) => void;
  onReorder?: (from: number, to: number) => void;
  /** rendered after each field, for the aggregation picker on Values */
  renderExtra?: (field: string, index: number) => React.ReactNode;
}

/** One drop target. */
export function Shelf({
  label,
  hint,
  fields,
  available,
  onAdd,
  onRemove,
  onReorder,
  renderExtra,
}: ShelfProps) {
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FIELD_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const field = e.dataTransfer.getData(FIELD_MIME);
        if (!field) return;
        e.preventDefault();
        if (!fields.includes(field)) onAdd(field);
      }}
      className="flex min-h-[92px] flex-col rounded-xl border border-dashed border-white/[0.10] bg-white/[0.015] p-2.5 transition-colors hover:border-white/20"
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {available.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAdd(e.target.value);
            }}
            aria-label={`Add a field to ${label}`}
            className="h-6 max-w-[110px] cursor-pointer rounded-md border border-white/10 bg-black/25 px-1.5 text-[10.5px] text-on-surface-variant outline-none focus:border-primary/50"
          >
            <option value="" className="bg-surface-container">
              Add field
            </option>
            {available.map((field) => (
              <option key={field} value={field} className="bg-surface-container">
                {field}
              </option>
            ))}
          </select>
        )}
      </div>

      {fields.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-2 text-center text-[10.5px] leading-snug text-on-surface-variant/50">
          {hint}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fields.map((field, index) => (
            <div
              key={field}
              draggable={!!onReorder}
              onDragStart={(e) => {
                e.dataTransfer.setData(FIELD_MIME, field);
                e.dataTransfer.setData("application/x-nexora-index", String(index));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => onReorder && e.preventDefault()}
              onDrop={(e) => {
                const from = e.dataTransfer.getData("application/x-nexora-index");
                if (from === "" || !onReorder) return;
                e.preventDefault();
                e.stopPropagation();
                onReorder(Number(from), index);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-container px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white">
                {field}
              </span>
              {renderExtra?.(field, index)}
              <button
                type="button"
                onClick={() => onRemove(field)}
                aria-label={`Remove ${field} from ${label}`}
                className="press flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-on-surface-variant hover:bg-white/10 hover:text-white"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The aggregation picker that rides on each field in the Values shelf. */
export function AggPicker({
  value,
  onChange,
}: {
  value: PivotValue;
  onChange: (agg: Aggregation) => void;
}) {
  return (
    <select
      value={value.agg}
      onChange={(e) => onChange(e.target.value as Aggregation)}
      aria-label={`Summarize ${value.field ?? "rows"} by`}
      className="h-6 shrink-0 cursor-pointer rounded-md border border-white/10 bg-black/25 px-1 text-[10.5px] text-primary outline-none focus:border-primary/50"
    >
      {AGGREGATIONS.map((agg) => (
        <option key={agg} value={agg} className="bg-surface-container">
          {agg}
        </option>
      ))}
    </select>
  );
}
