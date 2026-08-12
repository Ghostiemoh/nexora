"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, FileSpreadsheet, Check } from "lucide-react";
import { MODAL_BACKDROP } from "./layers";

interface SheetSelectorModalProps {
  filename: string;
  sheets: string[];
  onSelect: (sheetName: string) => void;
  onClose: () => void;
}

export function SheetSelectorModal({ filename, sheets, onSelect, onClose }: SheetSelectorModalProps) {
  const [selectedSheet, setSelectedSheet] = useState(sheets[0] || "");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={MODAL_BACKDROP} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sheet-selector-title" className="bg-surface-container-low border border-outline-variant/60 rounded-xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/40 flex justify-between items-center bg-surface-container/50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <h3 id="sheet-selector-title" className="font-headline-md text-[15px] font-bold text-on-surface">Select Worksheet</h3>
              <p className="text-[10px] text-on-surface-variant font-mono truncate max-w-[250px]">{filename}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            aria-label="Close worksheet selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4 max-h-[300px] overflow-y-auto">
          <p className="text-on-surface-variant text-body-md leading-relaxed">
            This workbook contains multiple sheets. Choose which worksheet you would like to import into Nexora:
          </p>

          <div className="flex flex-col gap-2">
            {sheets.map((sheet) => {
              const isSelected = selectedSheet === sheet;
              return (
                <button
                  key={sheet}
                  type="button"
                  onClick={() => setSelectedSheet(sheet)}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left cursor-pointer transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ${
                    isSelected
                      ? "bg-primary/5 border-primary text-primary"
                      : "bg-surface-container border-outline-variant/50 text-on-surface-variant hover:border-outline hover:text-on-surface"
                  }`}
                >
                  <span className="text-[13px] font-semibold truncate">{sheet}</span>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/40 flex justify-end gap-3 bg-surface-container/50">
          <button
            onClick={onClose}
            type="button"
            className="h-10 px-4 border border-outline-variant rounded-lg text-on-surface-variant text-body-md font-semibold hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(selectedSheet)}
            type="button"
            className="h-10 px-4 bg-primary text-on-primary hover:bg-primary/95 rounded-lg text-body-md font-bold transition-colors"
          >
            Ingest Sheet
          </button>
        </div>

      </div>
    </div>
  );
}
