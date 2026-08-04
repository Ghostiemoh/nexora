"use client";

import React, { useRef, useState } from "react";
import { Upload, AlertCircle, FileText } from "lucide-react";
import { useNexora } from "../lib/store";
import { parseCsvFile } from "../lib/csv";
import { parseJsonContent, parseExcelWorkbook, parseExcelSheet } from "../lib/universal-parser";
import { SheetSelectorModal } from "./layout/sheet-selector-modal";
import * as XLSX from "xlsx";

export function UploadDropzone({
  /** fired with the new dataset's id once it is profiled and in the store, so a
   *  caller can move the user straight on to the next step */
  onLoaded,
}: {
  onLoaded?: (datasetId: string) => void;
} = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addDataset = useNexora((s) => s.addDataset);
  const loadSample = useNexora((s) => s.loadSample);
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Excel Workbook Selection State
  const [excelWorkbook, setExcelWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [excelSheets, setExcelSheets] = useState<string[]>([]);
  const [excelFilename, setExcelFilename] = useState("");

  const processFile = async (file: File) => {
    setError(null);
    setBusy(true);
    
    try {
      const name = file.name;
      const ext = name.split(".").pop()?.toLowerCase();
      
      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        const result = await parseCsvFile(file);
        onLoaded?.(addDataset(name, result.columns, result.rows, result.truncated));
      } else if (ext === "json") {
        const text = await file.text();
        const result = parseJsonContent(text);
        onLoaded?.(addDataset(name, result.columns, result.rows, result.truncated));
      } else if (ext === "xlsx") {
        const buffer = await file.arrayBuffer();
        const { sheets, workbook } = parseExcelWorkbook(buffer);
        if (sheets.length === 0) {
          throw new Error("The Excel file has no worksheets.");
        }
        setExcelFilename(name);
        setExcelSheets(sheets);
        setExcelWorkbook(workbook);
      } else {
        throw new Error("Unsupported file format. Please upload a .csv, .tsv, .json, or .xlsx file.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process the file.");
    } finally {
      setBusy(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleIngestExcelSheet = (sheetName: string) => {
    if (!excelWorkbook) return;
    try {
      setBusy(true);
      const result = parseExcelSheet(excelWorkbook, sheetName);
      onLoaded?.(addDataset(`${excelFilename} (${sheetName})`, result.columns, result.rows));
      // Reset sheet selector state
      setExcelWorkbook(null);
      setExcelSheets([]);
      setExcelFilename("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import worksheet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 max-w-2xl mx-auto text-center h-full">
      {/* Dropzone Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-lg border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors duration-200 ${
          isDragOver
            ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(192,193,255,0.2)]"
            : "border-outline-variant hover:border-primary/50 bg-surface-container-low/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.json,.xlsx"
          onChange={handleFileChange}
          className="sr-only"
          aria-describedby="upload-file-help"
        />

        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
          <Upload className={`w-6 h-6 ${busy ? "animate-pulse" : ""}`} />
        </div>

        <h3 className="font-headline-md text-[16px] text-on-surface font-semibold mb-2">
          {busy ? "Analyzing data source..." : "Upload your dataset"}
        </h3>
        
        <p className="text-on-surface-variant text-body-md max-w-sm mb-4 leading-relaxed">
          Drag and drop a CSV, TSV, JSON, or Excel workbook here, or choose a file below.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="pill h-10 px-4 bg-primary text-on-primary text-[13px] disabled:opacity-50"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Choose file
        </button>
        
        <div id="upload-file-help" className="mt-4 flex flex-wrap justify-center gap-4 text-[11px] text-on-surface-variant font-mono">
          <span>Max Size: 25 MB</span>
          <span>•</span>
          <span>Max Rows: 50,000</span>
        </div>
      </div>

      {/* Anomaly Alerts */}
      {error && (
        <div className="mt-4 flex items-center gap-2 text-error text-body-md bg-error/10 border border-error/20 p-3 rounded-lg max-w-lg w-full text-left">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sample Loader */}
      <div className="mt-6 flex flex-col items-center gap-2">
        <span className="text-[12px] text-on-surface-variant">Want to explore Nexora features?</span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            onLoaded?.(loadSample());
          }}
          className="px-4 py-2 border border-primary/30 rounded-lg text-primary text-body-md font-semibold hover:bg-primary/10 hover:border-primary transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-95 cursor-pointer flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Load Customer Churn Sample
        </button>
      </div>

      {/* Excel Sheet Selector Modal */}
      {excelWorkbook && (
        <SheetSelectorModal
          filename={excelFilename}
          sheets={excelSheets}
          onSelect={handleIngestExcelSheet}
          onClose={() => {
            setExcelWorkbook(null);
            setExcelSheets([]);
            setExcelFilename("");
          }}
        />
      )}
    </div>
  );
}
