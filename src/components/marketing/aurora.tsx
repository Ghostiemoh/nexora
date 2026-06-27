/* Calm periwinkle aurora — two slow drifting blurred blobs.
   Adapted from 21st.dev's Aurora into Nexora's palette, kept subtle. */
export function Aurora({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div
        className="aurora-a absolute -top-1/3 left-1/4 h-[60vh] w-[60vh] rounded-full blur-[90px]"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 38%, transparent), transparent 70%)" }}
      />
      <div
        className="aurora-b absolute -bottom-1/3 right-1/5 h-[55vh] w-[55vh] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--secondary) 30%, transparent), transparent 70%)" }}
      />
    </div>
  );
}
