"use client";

import React, { useState } from "react";
import { X, FileSpreadsheet, Check } from "lucide-react";

interface SheetSelectorModalProps {
  filename: string;
  sheets: string[];
  onSelect: (sheetName: string) => void;
  onClose: () => void;
}

export function SheetSelectorModal({ filename, sheets, onSelect, onClose }: SheetSelectorModalProps) {
  const [selectedSheet, setSelectedSheet] = useState(sheets[0] || "");

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/40 flex justify-between items-center bg-surface-container/50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-headline-md text-[15px] font-bold text-on-surface">Select Worksheet</h3>
              <p className="text-[10px] text-on-surface-variant font-mono truncate max-w-[250px]">{filename}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
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
                  onClick={() => setSelectedSheet(sheet)}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left cursor-pointer transition-all duration-150 ${
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
            className="px-4 py-2 border border-outline-variant rounded-lg text-on-surface-variant text-body-md font-semibold hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer active:scale-95 duration-100"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(selectedSheet)}
            className="px-4 py-2 bg-primary text-on-primary hover:bg-primary/95 rounded-lg text-body-md font-bold transition-all cursor-pointer active:scale-95 duration-100 shadow-[0_0_15px_rgba(192,193,255,0.2)]"
          >
            Ingest Sheet
          </button>
        </div>

      </div>
    </div>
  );
}
