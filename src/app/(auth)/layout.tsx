import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NexoraMark } from "@/components/layout/nexora-mark";

/* The account pages get their own shell: no sidebar, no marketing header.
 *
 * Both of those exist to offer somewhere else to go, and this is the one
 * screen where the whole job is to finish a decision or decline it. The only
 * two ways out are the brand mark and an explicit exit, and the exit is
 * labelled with where it actually lands rather than "cancel". */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      {/* The same ambient wash the workspace uses, so this does not read as a
          different product bolted on at the door. */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-0 z-0 h-[38vh] w-[80vw] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse 50% 80% at 50% 0%, color-mix(in oklab, var(--primary) 11%, transparent), transparent 70%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Nexora home" className="press flex items-center gap-2.5">
          <NexoraMark />
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold leading-none tracking-tight text-on-surface">
              Nexora
            </span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant opacity-60">
              Analytics OS
            </span>
          </span>
        </Link>

        <Link
          href="/launch"
          className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] text-on-surface-variant transition-colors hover:bg-white/5 hover:text-on-surface"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to workspace
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 pt-2 sm:px-6">
        {children}
      </main>
    </div>
  );
}
