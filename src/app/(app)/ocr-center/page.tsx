"use client";

import { useState, useRef } from "react";
import {
  ScanLine,
  Upload,
  FileText,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function OcrCenterPage() {
  const mounted = useMounted();
  const router = useRouter();
  const addDataset = useNexora((s) => s.addDataset);

  const [scanState, setScanState] = useState<"idle" | "scanning" | "completed">("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mockColumns = ["Item_Description", "Quantity", "Unit_Price", "Total_Amount"];
  const mockRows = [
    { Item_Description: "MacBook Pro M3 Max", Quantity: 1, Unit_Price: 3199.00, Total_Amount: 3199.00 },
    { Item_Description: "Dell UltraSharp 32 Monitor", Quantity: 2, Unit_Price: 849.50, Total_Amount: 1699.00 },
    { Item_Description: "Keychron Q1 Mechanical Keyboard", Quantity: 3, Unit_Price: 189.00, Total_Amount: 567.00 },
    { Item_Description: "Logitech MX Master 3S", Quantity: 4, Unit_Price: 99.00, Total_Amount: 396.00 },
  ];

  if (!mounted) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-500 font-mono text-xs animate-pulse">
          Loading OCR Environment...
        </div>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      triggerScan(file.name);
    }
  };

  const triggerScan = (name: string) => {
    setFileName(name);
    setScanState("scanning");
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setScanState("completed");
          return 100;
        }
        return prev + 5;
      });
    }, 120);
  };

  const handleIngestOcrData = () => {
    if (scanState !== "completed") return;
    const cleanName = fileName.replace(/\.[^/.]+$/, "");
    addDataset(`ocr_invoice_${cleanName}`, mockColumns, mockRows);
    router.push("/dashboard");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="p-8 max-w-4xl mx-auto space-y-8 select-none"
    >
      {/* Title */}
      <div className="border-b border-white/5 pb-6">
        <h2 className="text-3xl font-bold text-white tracking-tight leading-tight mb-1">
          OCR Center Scan
        </h2>
        <p className="text-sm text-on-surface-variant">
          Upload receipt or invoice images to decompose structural table cells locally.
        </p>
      </div>

      {/* Main Scanner Canvas */}
      <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[360px] relative overflow-hidden backdrop-blur-md shadow-2xl">
        {/* Style block for local scan line animation */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes laser-sweep {
            0% { top: 0%; }
            50% { top: 100%; }
            100% { top: 0%; }
          }
          .animate-laser {
            animation: laser-sweep 3s ease-in-out infinite;
          }
        `}} />

        {scanState === "idle" && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center cursor-pointer space-y-4 max-w-md text-center p-8 border border-dashed border-white/10 hover:border-primary/40 bg-zinc-900/10 rounded-2xl transition-all w-full group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform duration-200 shadow-[inset_0_1px_rgba(255,255,255,0.05)]">
              <Upload className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="block text-sm font-bold text-white tracking-tight">Upload document scan</span>
              <span className="block text-xs text-zinc-500 leading-relaxed">
                Drag and drop JPG, PNG, or PDF receipt sheets. Cell parsing executes in-browser.
              </span>
            </div>
          </div>
        )}

        {scanState === "scanning" && (
          <div className="w-full max-w-md space-y-6 relative py-12 flex flex-col items-center">
            {/* Holographic Laser box */}
            <div className="w-32 h-40 bg-primary/5 border border-primary/20 rounded-2xl relative overflow-hidden shadow-[0_0_30px_rgba(192,193,255,0.05)] shadow-[inset_0_1px_rgba(255,255,255,0.05)]">
              <FileText className="w-16 h-16 text-primary/25 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
              {/* Animated scanning line */}
              <div className="absolute left-0 w-full h-[3px] bg-primary shadow-[0_0_15px_#c0c1ff] animate-laser" />
            </div>

            {/* Status counter */}
            <div className="w-full space-y-2.5 text-center">
              <div className="flex justify-between items-center text-xs font-mono px-1">
                <span className="text-zinc-500 font-semibold uppercase tracking-wider">Analyzing Cells</span>
                <span className="text-primary font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-zinc-900/60 h-2 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-primary transition-all duration-100 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-2">
                Ingesting {fileName}
              </span>
            </div>
          </div>
        )}

        {scanState === "completed" && (
          <div className="w-full space-y-6">
            {/* Ingestion success banner */}
            <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-5 rounded-2xl">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div className="space-y-0.5">
                  <span className="font-bold text-white text-sm block">Scan Matrix Decomposed</span>
                  <span className="text-xs text-zinc-400 leading-relaxed">
                    Extracted invoice tables from <span className="font-mono text-zinc-300">{fileName}</span>
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setScanState("idle")}
                  className="px-3.5 py-2 rounded-xl border border-white/10 hover:border-white/20 text-zinc-400 hover:text-white text-xs font-mono uppercase tracking-wider font-bold cursor-pointer transition-colors flex items-center gap-1.5 active:scale-[0.98]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Rescan
                </button>
                <button
                  onClick={handleIngestOcrData}
                  className="px-4 py-2 bg-emerald-500 text-black font-bold hover:bg-emerald-400 rounded-xl text-xs font-mono uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1 shadow-lg"
                >
                  Ingest Table
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Extracted table preview */}
            <div className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden shadow-inner">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-900/30 text-zinc-500 font-bold">
                    {mockColumns.map((c) => (
                      <th
                        key={c}
                        className="p-4 font-mono uppercase tracking-wider text-[10px]"
                      >
                        {c.replace("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[12px] text-zinc-400">
                  {mockRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-4 text-white font-semibold">{row.Item_Description}</td>
                      <td className="p-4 text-center">{row.Quantity}</td>
                      <td className="p-4 text-right text-primary">${row.Unit_Price.toFixed(2)}</td>
                      <td className="p-4 text-right text-white font-bold">${row.Total_Amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
