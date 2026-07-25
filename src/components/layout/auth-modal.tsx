"use client";

import { useEffect, useRef } from "react";
import { HardDrive, ShieldCheck, X } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="local-workspace-title" className="nexora-card w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary"><HardDrive className="h-5 w-5" aria-hidden="true" /></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="press flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface" aria-label="Close local workspace details"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <p className="text-label mt-6 text-primary">Local workspace</p>
        <h2 id="local-workspace-title" className="mt-1 text-xl font-semibold tracking-tight text-on-surface">No account is required.</h2>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">Nexora processes datasets in this browser. There is no sign-in, remote profile, or background upload in the current local-first build.</p>
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs leading-5 text-on-surface-variant">Your work persists only as local browser storage when capacity allows. Clear it anytime from Settings.</p>
        </div>
        <button type="button" onClick={onClose} className="pill mt-6 h-10 w-full bg-primary text-on-primary">Continue working locally</button>
      </section>
    </div>
  );
}
