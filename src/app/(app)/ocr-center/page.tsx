"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ScanLine,
  Upload,
  Trash2,
  ShieldCheck,
  FileText,
  Grid,
  CheckCircle,
  Play,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useMounted } from "@/lib/use-mounted";
import { useNexora } from "@/lib/store";
import { MAX_FILE_BYTES } from "@/lib/csv";
import type { Row } from "@/lib/types";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

interface OcrLog {
  status: string;
  progress: number;
}
interface OcrWorker {
  recognize: (image: File | string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
}
interface TesseractLib {
  createWorker: (lang: string, oem: number, options: { logger: (m: OcrLog) => void }) => Promise<OcrWorker>;
}
const getTesseract = (): TesseractLib | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { Tesseract?: TesseractLib }).Tesseract;

/* Minimal pdf.js surface (v3 legacy build, loaded from CDN like Tesseract). */
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}
interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPage {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  getViewport: (o: { scale: number }) => PdfViewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}
interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
}
const PDFJS_VERSION = "3.11.174";
const getPdfJs = (): PdfJsLib | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib;

const MAX_PDF_PAGES = 15;

/** Rebuild text lines from a PDF text layer: group items by y, order by x,
 *  and turn large horizontal gaps into double spaces so the table parser can
 *  split columns on them. */
function assemblePdfText(items: PdfTextItem[]): string {
  const lines = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5] / 3);
    const line = lines.get(y) ?? [];
    line.push(item);
    lines.set(y, line);
  }
  return Array.from(lines.entries())
    .sort((a, b) => b[0] - a[0]) // PDF y-axis points up
    .map(([, line]) => {
      line.sort((a, b) => a.transform[4] - b.transform[4]);
      let out = "";
      let prevEnd: number | null = null;
      for (const item of line) {
        const x = item.transform[4];
        if (prevEnd !== null) {
          out += x - prevEnd > 10 ? "  " : " ";
        }
        out += item.str.trim();
        prevEnd = x + item.width;
      }
      return out;
    })
    .join("\n");
}

export default function OcrCenterPage() {
  const mounted = useMounted();
  const router = useRouter();
  const addDataset = useNexora((s) => s.addDataset);
  const recordExport = useNexora((s) => s.recordExport);

  // File states
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<"image" | "pdf">("image");
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tesseract script state
  const [tesseractLoaded, setTesseractLoaded] = useState<boolean>(() => !!getTesseract());
  const [pdfJsLoaded, setPdfJsLoaded] = useState<boolean>(() => !!getPdfJs());
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrResultText, setOcrResultText] = useState("");

  // Parsed Table state
  const [parsedData, setParsedData] = useState<{ columns: string[]; rows: Row[] } | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<"text" | "table">("text");
  const [fileError, setFileError] = useState<string | null>(null);

  // Load Tesseract CDN script dynamically (once, if not already present).
  useEffect(() => {
    if (typeof window === "undefined" || getTesseract()) return;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => setTesseractLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Load pdf.js (legacy global build) the same way.
  useEffect(() => {
    if (typeof window === "undefined" || getPdfJs()) return;
    const script = document.createElement("script");
    script.src = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
    script.onload = () => {
      const lib = getPdfJs();
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;
        setPdfJsLoaded(true);
      }
    };
    document.body.appendChild(script);
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  if (!mounted) return null;

  // Handlers
  const loadImage = (file: File) => {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!file.type.startsWith("image/") && !isPdf) {
      setFileError("Please choose an image (PNG, JPG, screenshot) or a PDF.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 25 MB.`);
      return;
    }
    setFileError(null);
    setFileKind(isPdf ? "pdf" : "image");
    setPdfPageCount(null);
    setImageFile(file);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(isPdf ? null : URL.createObjectURL(file));
    setOcrResultText("");
    setParsedData(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) loadImage(file);
  };

  /** Extract text from a PDF: text layer first (fast, exact), and only when a
   *  page has no embedded text (scanned PDF) fall back to per-page OCR. */
  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjs = getPdfJs();
    if (!pdfjs) throw new Error("PDF engine not loaded yet");

    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    setPdfPageCount(doc.numPages);
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const chunks: string[] = [];

    for (let p = 1; p <= pages; p++) {
      setOcrStatus(`Reading page ${p} of ${pages}…`);
      setOcrProgress(Math.round(((p - 1) / pages) * 100));
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = assemblePdfText(content.items);

      if (text.trim().length >= 20) {
        chunks.push(text);
        continue;
      }

      // Scanned page: render to canvas and OCR it.
      const Tesseract = getTesseract();
      if (!Tesseract) continue;
      setOcrStatus(`Page ${p} is a scan, running OCR…`);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const worker = await Tesseract.createWorker("eng", 1, {
        logger: (m: OcrLog) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(((p - 1 + m.progress) / pages) * 100));
          }
        },
      });
      const { data } = await worker.recognize(canvas.toDataURL("image/png"));
      await worker.terminate();
      chunks.push(data.text);
    }

    if (doc.numPages > MAX_PDF_PAGES) {
      setOcrStatus(`Processed the first ${MAX_PDF_PAGES} of ${doc.numPages} pages.`);
    }
    return chunks.join("\n");
  };

  const handleRunOcr = async () => {
    if (!imageFile) return;
    if (fileKind === "pdf" && !pdfJsLoaded) return;
    if (fileKind === "image" && !getTesseract()) return;

    setOcrRunning(true);
    setOcrStatus(fileKind === "pdf" ? "Opening PDF…" : "Initializing OCR engine...");
    setOcrProgress(0);

    try {
      let text: string;
      if (fileKind === "pdf") {
        text = await extractPdfText(imageFile);
        setOcrProgress(100);
      } else {
        const Tesseract = getTesseract()!;
        const worker = await Tesseract.createWorker("eng", 1, {
          logger: (m: OcrLog) => {
            if (m.status === "recognizing text") {
              setOcrStatus("Extracting character layouts...");
              setOcrProgress(Math.round(m.progress * 100));
            } else {
              setOcrStatus(m.status);
            }
          }
        });
        const result = await worker.recognize(imageFile);
        text = result.data.text;
        await worker.terminate();
      }

      setOcrResultText(text);
      const parsed = parseTextToTable(text);
      setParsedData(parsed);

      if (parsed.columns.length > 1 && parsed.rows.length > 0) {
        setActiveViewTab("table");
      } else {
        setActiveViewTab("text");
      }
    } catch (err) {
      console.error(err);
      setOcrStatus(fileKind === "pdf" ? "Could not read this PDF. Try again or use a screenshot." : "OCR Error occurred. Please try again.");
    } finally {
      setOcrRunning(false);
    }
  };

  const handleDownloadXlsx = () => {
    if (!parsedData || parsedData.columns.length === 0) return;
    const aoa: (string | number | boolean | null)[][] = [
      parsedData.columns,
      ...parsedData.rows.map((r) => parsedData.columns.map((c) => r[c] ?? null)),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Extracted");
    const base = (imageFile?.name || "extracted").replace(/\.[^/.]+$/, "");
    XLSX.writeFile(wb, `${base}_extracted.xlsx`);
    // Keep a CSV twin in history so the extraction is re-downloadable later.
    const csvTwin = aoa.map((row) => row.map((c) => (c === null ? "" : String(c).replace(/"/g, '""'))).map((c) => `"${c}"`).join(",")).join("\n");
    recordExport({ kind: "csv", filename: `${base}_extracted.csv`, content: csvTwin });
  };

  const handleImportDataset = () => {
    if (!parsedData || parsedData.columns.length === 0) return;
    const cleanName = (imageFile?.name || "scanned_invoice").replace(/\.[^/.]+$/, "") + "_ocr.csv";
    addDataset(cleanName, parsedData.columns, parsedData.rows);
    router.push("/dataset-doctor");
  };

  const handleClear = () => {
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setOcrResultText("");
    setParsedData(null);
  };

  // Raw text to CSV/Table Parser
  const parseTextToTable = (text: string): { columns: string[]; rows: Row[] } => {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return { columns: [], rows: [] };

    // Delimiter matching
    const delimiters = [
      { name: "tab", regex: /\t/ },
      { name: "pipe", regex: /\|/ },
      { name: "comma", regex: /,/ },
      { name: "semicolon", regex: /;/ },
      { name: "spaces", regex: /\s{2,}/ }
    ];

    let bestDelimiter = delimiters[0];
    let maxConsistentLines = 0;

    delimiters.forEach(delim => {
      let validLines = 0;
      lines.forEach(line => {
        const parts = line.split(delim.regex);
        if (parts.length >= 2) {
          validLines++;
        }
      });
      if (validLines > maxConsistentLines) {
        maxConsistentLines = validLines;
        bestDelimiter = delim;
      }
    });

    const splitter = maxConsistentLines > 0 ? bestDelimiter.regex : /\s+/;

    const parsedRows = lines.map(line => {
      return line.split(splitter).map(cell => cell.trim().replace(/^["']|["']$/g, "")).filter(c => c !== "");
    }).filter(row => row.length > 0);

    if (parsedRows.length === 0) return { columns: [], rows: [] };

    const maxCols = Math.max(...parsedRows.map(row => row.length));

    // Columns mapping
    const columns: string[] = [];
    const firstRow = parsedRows[0];
    
    for (let i = 0; i < maxCols; i++) {
      const rawColName = firstRow[i] ? String(firstRow[i]).replace(/[^a-zA-Z0-9_]/g, "_") : `col_${i + 1}`;
      let colName = rawColName;
      let suffix = 1;
      while (columns.includes(colName)) {
        colName = `${rawColName}_${suffix}`;
        suffix++;
      }
      columns.push(colName);
    }

    // Rows mapping
    const rows = parsedRows.slice(1).map((rowParts) => {
      const rowObj: Row = {};
      columns.forEach((colName, colIdx) => {
        const val = rowParts[colIdx] !== undefined ? rowParts[colIdx] : null;
        if (val !== null && val !== "" && !isNaN(Number(val))) {
          rowObj[colName] = Number(val);
        } else if (val === "true" || val === "TRUE") {
          rowObj[colName] = true;
        } else if (val === "false" || val === "FALSE") {
          rowObj[colName] = false;
        } else {
          rowObj[colName] = val;
        }
      });
      return rowObj;
    });

    return { columns, rows };
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-5xl items-center p-5 sm:p-8 select-none">
      <section className="nexora-card w-full overflow-hidden p-6 sm:p-8 space-y-6 relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        {/* Title */}
        <div className="flex justify-between items-start border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <ScanLine className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-label text-primary">OCR center</p>
              <h1 className="text-2xl font-bold tracking-tight text-white">Client-side document scanner</h1>
            </div>
          </div>
          {!tesseractLoaded && (
            <span className="text-[10px] font-mono uppercase bg-zinc-900 border border-white/5 px-2.5 py-1 rounded text-zinc-500 animate-pulse">
              Initializing engine...
            </span>
          )}
        </div>

        {/* Dynamic Area */}
        {!imageFile ? (
          /* Empty State / Uploader */
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="w-full border-2 border-dashed border-outline-variant hover:border-primary/50 bg-surface-container-low/30 rounded-xl p-12 flex flex-col items-center justify-center text-center transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="sr-only"
            />
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-[15px] text-white mb-1">
              Upload scanned file or PDF
            </h3>
            <p className="text-on-surface-variant text-xs max-w-sm mb-4 leading-relaxed">
              Drag & drop a PNG, JPG, screenshot, or PDF of a dataset/invoice here, or click to
              choose. Tables come out as a dataset or an Excel file.
            </p>
            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Your file never leaves your device. Extraction runs locally in your browser.</span>
            </div>
            {fileError && (
              <p className="mt-4 text-xs text-error font-medium" role="alert">
                {fileError}
              </p>
            )}
          </div>
        ) : (
          /* Workspace OCR Screen */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Image Preview Block */}
            <div className="md:col-span-5 flex flex-col space-y-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold tracking-wider">Scanned Document</span>
                <button
                  onClick={handleClear}
                  className="text-xs text-zinc-500 hover:text-error transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>

              <div className="border border-white/5 rounded-2xl overflow-hidden bg-black/40 p-3 flex-1 flex items-center justify-center min-h-[220px]">
                {fileKind === "pdf" ? (
                  <div className="flex flex-col items-center text-center gap-2 py-8">
                    <FileText className="w-12 h-12 text-primary/70" />
                    <span className="text-sm text-white font-medium max-w-[26ch] truncate" title={imageFile?.name}>
                      {imageFile?.name}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      PDF · {((imageFile?.size ?? 0) / 1024 / 1024).toFixed(1)} MB
                      {pdfPageCount !== null && ` · ${pdfPageCount} page(s)`}
                    </span>
                  </div>
                ) : (
                  imagePreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreviewUrl}
                      alt="Scanned source"
                      className="max-h-[360px] w-auto object-contain rounded-lg"
                    />
                  )
                )}
              </div>

              {/* Action trigger */}
              {!ocrResultText && !ocrRunning && (
                <button
                  onClick={handleRunOcr}
                  disabled={fileKind === "pdf" ? !pdfJsLoaded : !tesseractLoaded}
                  className="w-full py-3 bg-primary text-black font-mono text-xs uppercase tracking-wider font-bold hover:bg-primary-fixed rounded-xl transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {fileKind === "pdf" ? "Extract Tables from PDF" : "Run OCR Scan"}
                </button>
              )}

              {ocrRunning && (
                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4">
                  <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      className="h-full bg-primary" 
                      initial={{ width: 0 }}
                      animate={{ width: `${ocrProgress}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono mt-2 flex justify-between">
                    <span>{ocrStatus}</span>
                    <span className="text-primary font-bold">{ocrProgress}%</span>
                  </p>
                </div>
              )}
            </div>

            {/* OCR Output Console */}
            <div className="md:col-span-7 flex flex-col space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex bg-surface-container-low/60 rounded-xl p-1 border border-white/5 select-none text-[12px]">
                  <button
                    onClick={() => setActiveViewTab("text")}
                    disabled={!ocrResultText}
                    className={`relative px-3.5 py-1.5 rounded-lg font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      activeViewTab === "text" ? "bg-primary text-black" : "text-on-surface-variant hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Extracted Text
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveViewTab("table")}
                    disabled={!parsedData || parsedData.columns.length === 0}
                    className={`relative px-3.5 py-1.5 rounded-lg font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      activeViewTab === "table" ? "bg-primary text-black" : "text-on-surface-variant hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Grid className="w-3.5 h-3.5" />
                      Parsed Grid
                    </div>
                  </button>
                </div>

                {parsedData && parsedData.columns.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadXlsx}
                      className="px-3.5 py-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-black font-sans text-xs font-bold cursor-pointer transition-colors rounded-xl flex items-center gap-1.5 active:scale-[0.98]"
                      title="Download the parsed table as an Excel file"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel
                    </button>
                    <button
                      onClick={handleImportDataset}
                      className="px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black font-sans text-xs font-bold cursor-pointer transition-colors rounded-xl flex items-center gap-1.5 active:scale-[0.98]"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Import to Sandbox
                    </button>
                  </div>
                )}
              </div>

              {/* Console screen content */}
              <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl overflow-hidden min-h-[300px] flex flex-col relative shadow-inner">
                {!ocrResultText && !ocrRunning ? (
                  <div className="flex-1 flex flex-col justify-center items-center text-center text-zinc-500 p-6">
                    <ScanLine className="w-8 h-8 mb-3 text-zinc-700 animate-pulse" />
                    <span className="text-xs font-mono uppercase tracking-wider">Awaiting Scan trigger</span>
                    <span className="text-[11px] text-zinc-600 mt-2 max-w-[34ch] font-sans leading-relaxed">
                      Click the OCR Scan button to execute the WebAssembly OCR worker in your browser.
                    </span>
                  </div>
                ) : activeViewTab === "text" ? (
                  /* RAW TEXT OUTPUT */
                  <textarea
                    value={ocrResultText}
                    onChange={(e) => {
                      setOcrResultText(e.target.value);
                      setParsedData(parseTextToTable(e.target.value));
                    }}
                    className="flex-1 bg-transparent p-4 text-emerald-400 font-mono text-xs placeholder:text-zinc-700 focus:outline-none resize-none leading-relaxed h-full w-full"
                    spellCheck="false"
                  />
                ) : (
                  /* PARSED GRID TABLE PREVIEW */
                  <div className="flex-1 overflow-auto">
                    {parsedData && (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/5 bg-zinc-950/40 text-zinc-500 font-bold font-mono text-[9px] uppercase tracking-wider">
                            {parsedData.columns.map((c) => (
                              <th key={c} className="p-3 border-r border-white/5">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-[11px] text-zinc-300">
                          {parsedData.rows.length === 0 ? (
                            <tr>
                              <td colSpan={parsedData.columns.length} className="p-6 text-center text-zinc-600 uppercase">
                                Empty parsed grid
                              </td>
                            </tr>
                          ) : (
                            parsedData.rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                {parsedData.columns.map((c) => (
                                  <td key={c} className="p-3 truncate max-w-[140px] border-r border-white/5">
                                    {row[c] === null || row[c] === undefined ? (
                                      <span className="text-tertiary">null</span>
                                    ) : (
                                      String(row[c])
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
