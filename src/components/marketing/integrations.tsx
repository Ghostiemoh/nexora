import {
  Database,
  FileSpreadsheet,
  FileJson,
  Table2,
  FileText,
  ScanLine,
  FileType2,
} from "lucide-react";
import { Reveal } from "./sleek";

/* Every entry here is a format or store Nexora actually reads today, verified
 * against the parser and the connection routes. No aspirational logos, no
 * "coming soon" placeholders: if it is on this row, you can use it now. */
const SOURCES: { label: string; detail: string; icon: typeof Database }[] = [
  { label: "CSV", detail: "delimiter sniffing, quoted fields", icon: Table2 },
  { label: "TSV", detail: "tab-separated exports", icon: Table2 },
  { label: "Excel", detail: ".xlsx, one sheet at a time", icon: FileSpreadsheet },
  { label: "JSON", detail: "arrays of records, nested keys flattened", icon: FileJson },
  { label: "Plain text", detail: "any delimited .txt", icon: FileText },
  { label: "PostgreSQL", detail: "read-only query connection", icon: Database },
  { label: "MySQL", detail: "read-only query connection", icon: Database },
  { label: "Scanned images", detail: "OCR to a clean table", icon: ScanLine },
  { label: "PDF tables", detail: "text extraction to rows", icon: FileType2 },
];

function Chip({ label, detail, icon: Icon }: { label: string; detail: string; icon: typeof Database }) {
  return (
    <div
      className="mx-3 flex shrink-0 items-center gap-2.5 rounded-full glass px-5 py-2.5 text-zinc-400"
      title={detail}
    >
      <Icon className="h-4 w-4 text-zinc-500" strokeWidth={1.75} aria-hidden="true" />
      <span className="whitespace-nowrap text-[13.5px] font-medium">{label}</span>
    </div>
  );
}

export function Integrations() {
  return (
    <section className="py-16" aria-label="Supported data sources">
      <Reveal className="mb-8 px-6 text-center">
        <p className="text-[13px] uppercase tracking-[0.2em] text-zinc-500">
          Reads these today
        </p>
        <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-zinc-600">
          Nine sources, all working, all parsed in your browser. Nothing on this list is a
          placeholder for something we plan to build.
        </p>
      </Reveal>
      <div className="marquee-mask overflow-hidden">
        <div className="marquee-track">
          {[...SOURCES, ...SOURCES].map((s, i) => (
            <Chip key={i} label={s.label} detail={s.detail} icon={s.icon} />
          ))}
        </div>
      </div>
    </section>
  );
}
