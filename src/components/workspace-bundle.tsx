"use client";

import { useRef, useState } from "react";
import { PackageOpen, PackageCheck, Share2 } from "lucide-react";
import { useNexora } from "@/lib/store";
import type { Dataset, TeamMember, CleanOp, Row } from "@/lib/types";

interface WorkspaceBundle {
  version: 1;
  kind: "nexora-workspace";
  exportedAt: string;
  datasets: {
    name: string;
    columns: string[];
    rows: Row[];
    recipe: CleanOp[];
    changelog: string[];
  }[];
  teamMembers: TeamMember[];
}

const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;

/** Team workspace sharing without a server: the whole workspace (datasets,
 *  recipes, audit trails, team roster) exports as one JSON bundle a teammate
 *  imports on their machine. Local-first collaboration. */
export function WorkspaceBundleCard() {
  const datasets = useNexora((s) => s.datasets);
  const teamMembers = useNexora((s) => s.teamMembers);
  const addDataset = useNexora((s) => s.addDataset);
  const addTeamMember = useNexora((s) => s.addTeamMember);
  const recordExport = useNexora((s) => s.recordExport);
  const notify = useNexora((s) => s.notify);
  const logAudit = useNexora((s) => s.logAudit);

  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    const bundle: WorkspaceBundle = {
      version: 1,
      kind: "nexora-workspace",
      exportedAt: new Date().toISOString(),
      datasets: datasets.map((d: Dataset) => ({
        name: d.name,
        columns: d.columns,
        rows: d.rows,
        recipe: d.recipe ?? [],
        changelog: d.changelog,
      })),
      teamMembers,
    };
    const json = JSON.stringify(bundle);
    if (json.length > MAX_BUNDLE_BYTES) {
      notify("warning", "Workspace too large", "The bundle exceeds 20 MB — remove a large dataset first.");
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename = `nexora_workspace_${new Date().toISOString().slice(0, 10)}.json`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    recordExport({ kind: "workspace", filename, content: json });
    notify("success", "Workspace exported", `${datasets.length} dataset(s) + ${teamMembers.length} member(s) bundled.`);
  };

  const handleImport = async (file: File) => {
    setError(null);
    try {
      if (file.size > MAX_BUNDLE_BYTES) throw new Error("Bundle exceeds the 20 MB limit.");
      const parsed = JSON.parse(await file.text()) as Partial<WorkspaceBundle>;
      if (parsed.kind !== "nexora-workspace" || parsed.version !== 1 || !Array.isArray(parsed.datasets)) {
        throw new Error("Not a Nexora workspace bundle.");
      }

      let imported = 0;
      for (const d of parsed.datasets) {
        if (!d.name || !Array.isArray(d.columns) || !Array.isArray(d.rows)) continue;
        addDataset(d.name, d.columns, d.rows);
        imported++;
      }
      const existingEmails = new Set(teamMembers.map((m) => m.email));
      let members = 0;
      for (const m of parsed.teamMembers ?? []) {
        if (m.email && !existingEmails.has(m.email)) {
          addTeamMember({ name: m.name, role: m.role, email: m.email, roleType: m.roleType });
          members++;
        }
      }
      logAudit("team", `Imported workspace bundle: ${imported} dataset(s), ${members} new member(s).`);
      notify("success", "Workspace imported", `${imported} dataset(s) and ${members} member(s) added.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the bundle.");
    }
  };

  return (
    <div className="nexora-card p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <Share2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-white">Shared workspace</h3>
      </div>
      <p className="text-xs text-on-surface-variant leading-relaxed">
        Bundle every dataset (with its cleaning recipe and audit trail) plus the team roster into one
        file. A teammate imports it and gets the exact same workspace — no account, no server, data
        stays on your machines.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleExport}
          disabled={datasets.length === 0}
          className="press px-4 py-2.5 rounded-xl bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
        >
          <PackageCheck className="w-3.5 h-3.5" />
          Export workspace bundle
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="press px-4 py-2.5 rounded-xl border border-white/10 text-on-surface hover:bg-white/[0.06] text-[12px] font-medium cursor-pointer flex items-center gap-1.5"
        >
          <PackageOpen className="w-3.5 h-3.5" />
          Import bundle
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
    </div>
  );
}
