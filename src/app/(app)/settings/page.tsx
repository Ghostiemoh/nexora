"use client";

import { useState } from "react";
import { Database, HardDrive, Monitor, ShieldCheck, Trash2, Sparkles } from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { useNexora } from "@/lib/store";
import { AccountPanel } from "@/components/account-panel";

export default function SettingsPage() {
  const mounted = useMounted();
  const datasets = useNexora((state) => state.datasets);
  const removeDataset = useNexora((state) => state.removeDataset);
  const onboardingDismissed = useNexora((state) => state.onboardingDismissed);
  const dismissOnboarding = useNexora((state) => state.dismissOnboarding);
  const restoreOnboarding = useNexora((state) => state.restoreOnboarding);
  const connections = useNexora((state) => state.connections);
  const settings = useNexora((state) => state.settings);
  const setGeminiApiKey = useNexora((state) => state.setGeminiApiKey);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);

  if (!mounted) return <div className="min-h-[60vh]" aria-busy="true" />;

  const clearLocalData = () => {
    datasets.forEach((dataset) => removeDataset(dataset.id));
    setIsConfirmingClear(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-5 sm:p-8">
      <header className="max-w-2xl space-y-2">
        <p className="text-label text-primary">Workspace controls</p>
        <h1 className="text-3xl font-semibold tracking-tight text-on-surface">Local, clear, and in your control.</h1>
        <p className="text-sm leading-6 text-on-surface-variant">Nexora analyses your data in this browser. Sync is opt-in, encrypted before it leaves, and covers your recipes rather than your datasets. These controls only describe behavior that is available today.</p>
      </header>

      <AccountPanel />

      <section className="nexora-card grid gap-px overflow-hidden sm:grid-cols-3" aria-label="Local workspace status">
        {[
          { icon: ShieldCheck, label: "Processing", value: "This browser", note: "Files stay on this device." },
          {
            icon: Database,
            label: "External databases",
            value: connections.length > 0 ? `${connections.length} connection(s)` : "Not connected",
            note: connections.length > 0 ? "Read-only, via Data Sources." : "Add one under Data Sources.",
          },
          { icon: Monitor, label: "Appearance", value: "Focus mode", note: "High-contrast data workspace." },
        ].map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="bg-surface-container-low p-5">
            <Icon className="mb-5 h-5 w-5 text-primary" aria-hidden="true" />
            <p className="text-label text-on-surface-variant">{label}</p>
            <p className="mt-1 text-base font-semibold text-on-surface">{value}</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{note}</p>
          </div>
        ))}
      </section>

      <section className="nexora-card p-5 space-y-4" aria-label="AI settings">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-on-surface">AI &amp; integrations</h2>
        </div>
        <p className="text-xs leading-5 text-on-surface-variant max-w-2xl">
          Add a Google Gemini API key and you can chat with your data in plain English, turn a
          question into SQL, and get broken queries rewritten. The key is stored only in this
          browser. Requests carry your dataset&apos;s{" "}
          <span className="text-on-surface">schema and five sample rows</span>, while the data itself
          stays here.
        </p>
        <div className="flex gap-2 max-w-xl">
          <input
            type="password"
            value={keyDraft ?? settings.geminiApiKey}
            onChange={(e) => {
              setKeyDraft(e.target.value);
              setKeySaved(false);
            }}
            placeholder="AIza… (Google AI Studio key)"
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-on-surface outline-none focus:border-primary/50"
            aria-label="Gemini API key"
          />
          <button
            type="button"
            onClick={() => {
              setGeminiApiKey((keyDraft ?? settings.geminiApiKey).trim());
              setKeyDraft(null);
              setKeySaved(true);
            }}
            className="press cursor-pointer rounded-lg border border-primary/20 bg-primary/12 px-4 py-2.5 text-[12px] font-medium text-primary hover:bg-primary/20"
          >
            {keySaved ? "Saved ✓" : "Save key"}
          </button>
        </div>
        <p className="text-[11px] font-mono text-on-surface-variant/70">
          Status: {settings.geminiApiKey ? "AI features enabled" : "AI features off. The local rule-based analyst still works."}
        </p>
      </section>

      <section className="nexora-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-label text-primary">Guidance</p>
          <h2 className="mt-1 text-lg font-semibold text-on-surface">Getting started checklist</h2>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">
            The four-step path from a loaded file to an exported report, shown at the top of the
            dashboard. {onboardingDismissed ? "Currently hidden." : "Currently shown."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (onboardingDismissed ? restoreOnboarding() : dismissOnboarding())}
          className="press h-10 shrink-0 cursor-pointer rounded-lg border border-outline-variant px-3.5 text-sm font-medium text-on-surface hover:bg-white/[0.06]"
        >
          {onboardingDismissed ? "Show it again" : "Hide it"}
        </button>
      </section>

      <section className="nexora-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-outline-variant p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-label text-primary">Local data</p>
            <h2 className="mt-1 text-lg font-semibold text-on-surface">Datasets in this workspace</h2>
          </div>
          <p className="font-mono text-xs text-on-surface-variant">{datasets.length} active {datasets.length === 1 ? "dataset" : "datasets"}</p>
        </div>

        {datasets.length === 0 ? (
          <div className="p-8 text-center">
            <HardDrive className="mx-auto h-7 w-7 text-on-surface-variant" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-on-surface">No local datasets yet</p>
            <p className="mt-1 text-xs text-on-surface-variant">Upload a file from the Dashboard to begin.</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {datasets.map((dataset) => (
              <div key={dataset.id} className="flex items-center gap-3 px-5 py-4">
                <Database className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-on-surface">{dataset.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-on-surface-variant">{dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns</p>
                </div>
                <button type="button" onClick={() => removeDataset(dataset.id)} className="press flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/15 hover:text-error" aria-label={`Remove ${dataset.name}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {datasets.length > 0 && (
        <section className="flex flex-col gap-4 rounded-xl border border-error/35 bg-error/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">Clear this browser workspace</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">This permanently removes all datasets and local analyst context from Nexora.</p>
          </div>
          {isConfirmingClear ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsConfirmingClear(false)} className="press h-10 rounded-lg border border-outline-variant px-3 text-sm text-on-surface">Cancel</button>
              <button type="button" onClick={clearLocalData} className="pill h-10 bg-error px-3 text-sm text-on-error">Clear data</button>
            </div>
          ) : (
            <button type="button" onClick={() => setIsConfirmingClear(true)} className="press flex h-10 items-center gap-2 rounded-lg border border-error/45 px-3 text-sm font-medium text-error hover:bg-error/10">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear workspace
            </button>
          )}
        </section>
      )}
    </div>
  );
}
