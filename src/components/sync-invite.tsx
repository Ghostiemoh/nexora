"use client";

/* The optional sign-in, offered once between the marketing site and the tools.
 *
 * Deliberately not a gate. Nexora's whole claim is that it works on your machine
 * without an account, and that claim is printed on the home page, in the sidebar
 * and in the pricing copy. A wall here would make all of it false. So this asks,
 * takes no for an answer, and remembers the answer.
 *
 * It renders nothing at all unless there is a real decision to make: not when
 * the deployment has no credentials, not when the reader is already signed in,
 * and not after they have said no once. */

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useSync } from "@/lib/sync-store";
import { useMounted } from "@/lib/use-mounted";
import { AccountPanel } from "./account-panel";

export function SyncInvite() {
  const mounted = useMounted();
  const stage = useSync((s) => s.stage);
  const dismissed = useSync((s) => s.syncPromptDismissed);
  const dismissSyncPrompt = useSync((s) => s.dismissSyncPrompt);
  const refresh = useSync((s) => s.refresh);

  /* The store's opening stage is a guess made from configuration alone, before
   * any session has been read. Waiting for the real answer costs a moment and
   * saves showing a sign-in to someone who is already signed in. */
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    void refresh().finally(() => setChecked(true));
  }, [mounted, refresh]);

  if (!mounted || !checked) return null;
  if (dismissed) return null;
  if (stage !== "signedOut") return null;

  return (
    <section aria-label="Optional sign-in" className="space-y-3">
      <AccountPanel />

      <div className="flex flex-col items-start gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11.5px] text-on-surface-variant/80">
          An account carries your datasets and cleaning recipes to your other devices, sealed before
          they leave. Every tool below works without one.
        </p>
        <button
          type="button"
          onClick={dismissSyncPrompt}
          className="press flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12.5px] text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface"
        >
          Continue without an account
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
