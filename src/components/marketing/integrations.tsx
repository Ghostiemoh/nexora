import { Database, FileSpreadsheet, FileJson, Table2, Sheet, Boxes, HardDrive, Cloud } from "lucide-react";
import { Reveal } from "./sleek";

/* Honest "works with" row: formats and stores Nexora ingests, not fake
   endorsement logos. Monochrome chips in an edge-masked marquee. */
const STACK: { label: string; icon: typeof Database }[] = [
  { label: "PostgreSQL", icon: Database },
  { label: "MySQL", icon: Database },
  { label: "CSV", icon: Table2 },
  { label: "Excel", icon: FileSpreadsheet },
  { label: "Google Sheets", icon: Sheet },
  { label: "Parquet", icon: Boxes },
  { label: "JSON", icon: FileJson },
  { label: "Snowflake", icon: Cloud },
  { label: "SQLite", icon: HardDrive },
];

function Chip({ label, icon: Icon }: { label: string; icon: typeof Database }) {
  return (
    <div className="flex items-center gap-2.5 mx-3 shrink-0 rounded-full glass px-5 py-2.5 text-zinc-400">
      <Icon className="w-4 h-4 text-zinc-500" strokeWidth={1.75} />
      <span className="text-[13.5px] font-medium whitespace-nowrap">{label}</span>
    </div>
  );
}

export function Integrations() {
  return (
    <section className="py-16">
      <Reveal className="text-center mb-8 px-6">
        <p className="text-[13px] uppercase tracking-[0.2em] text-zinc-500">
          Connects to the tools you already use
        </p>
      </Reveal>
      <div className="marquee-mask overflow-hidden">
        <div className="marquee-track">
          {[...STACK, ...STACK].map((s, i) => (
            <Chip key={i} label={s.label} icon={s.icon} />
          ))}
        </div>
      </div>
    </section>
  );
}
