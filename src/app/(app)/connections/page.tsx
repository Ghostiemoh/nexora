"use client";

import { useState } from "react";
import {
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  DownloadCloud,
} from "lucide-react";
import { useNexora } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { DbConnection } from "@/lib/types";

interface TestResponse {
  ok?: boolean;
  tables?: string[];
  error?: string;
}
interface QueryResponse {
  ok?: boolean;
  columns?: string[];
  rows?: Record<string, string | number | boolean | null>[];
  truncated?: boolean;
  error?: string;
}

export default function ConnectionsPage() {
  const mounted = useMounted();
  const router = useRouter();
  const connections = useNexora((s) => s.connections);
  const addConnection = useNexora((s) => s.addConnection);
  const updateConnection = useNexora((s) => s.updateConnection);
  const removeConnection = useNexora((s) => s.removeConnection);
  const addDataset = useNexora((s) => s.addDataset);
  const notify = useNexora((s) => s.notify);
  const logAudit = useNexora((s) => s.logAudit);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"postgres" | "mysql">("postgres");
  const [connStr, setConnStr] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [tablesByConn, setTablesByConn] = useState<Record<string, string[]>>({});
  const [queryByConn, setQueryByConn] = useState<Record<string, string>>({});

  if (!mounted) return null;

  const handleAdd = () => {
    if (!name.trim() || !connStr.trim()) return;
    addConnection({ name: name.trim(), type, connectionString: connStr.trim() });
    setName("");
    setConnStr("");
    setShowForm(false);
  };

  const handleTest = async (conn: DbConnection) => {
    setBusyId(conn.id);
    try {
      const res = await fetch("/api/db/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: conn.type, connectionString: conn.connectionString }),
      });
      const data = (await res.json()) as TestResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Connection failed");
      updateConnection(conn.id, { lastStatus: "ok", lastError: undefined });
      setTablesByConn((prev) => ({ ...prev, [conn.id]: data.tables ?? [] }));
      notify("success", "Connection OK", `'${conn.name}' is reachable — ${data.tables?.length ?? 0} table(s) found.`);
      logAudit("connection", `Tested '${conn.name}': OK (${data.tables?.length ?? 0} tables).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      updateConnection(conn.id, { lastStatus: "error", lastError: msg });
      notify("error", "Connection failed", `'${conn.name}': ${msg}`);
      logAudit("connection", `Tested '${conn.name}': FAILED — ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = async (conn: DbConnection, sql: string, label: string) => {
    if (!sql.trim()) return;
    setBusyId(conn.id);
    try {
      const res = await fetch("/api/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: conn.type, connectionString: conn.connectionString, query: sql }),
      });
      const data = (await res.json()) as QueryResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Query failed");
      if (!data.columns?.length || !data.rows?.length) throw new Error("Query returned no rows.");

      addDataset(`${conn.name} · ${label}`, data.columns, data.rows, data.truncated ?? false);
      logAudit("import", `Imported ${data.rows.length} rows from '${conn.name}' (${label}).`);
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      notify("error", "Import failed", `'${conn.name}': ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  const inputCls =
    "bg-black/30 border border-white/10 rounded-lg text-xs text-white px-2.5 py-2 focus:border-primary/50 outline-none w-full";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 md:p-8 max-w-4xl mx-auto space-y-6"
    >
      <div className="flex justify-between items-end gap-4 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">Data Sources</h1>
          <p className="text-sm text-on-surface-variant">
            Connect PostgreSQL and MySQL databases and pull tables straight into the sandbox. Queries
            run read-only through Nexora&apos;s API; connection strings stay in this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="pill h-10 px-4 bg-primary text-on-primary text-[13px] shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add connection
        </button>
      </div>

      {showForm && (
        <div className="nexora-card p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Prod Postgres)" className={inputCls} />
            <select value={type} onChange={(e) => setType(e.target.value as "postgres" | "mysql")} className={`${inputCls} cursor-pointer`}>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
            <input
              value={connStr}
              onChange={(e) => setConnStr(e.target.value)}
              placeholder={type === "postgres" ? "postgres://user:pass@host:5432/db" : "mysql://user:pass@host:3306/db"}
              className={inputCls}
              type="password"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!name.trim() || !connStr.trim()}
              className="press px-4 py-2 rounded-lg bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer disabled:opacity-40"
            >
              Save connection
            </button>
          </div>
        </div>
      )}

      {connections.length === 0 && !showForm ? (
        <div className="nexora-card p-12 text-center">
          <Plug className="w-8 h-8 text-primary/60 mx-auto mb-3" />
          <p className="text-sm text-white font-medium">No connections yet</p>
          <p className="text-xs text-on-surface-variant mt-1.5 max-w-[42ch] mx-auto leading-relaxed">
            Add a PostgreSQL or MySQL connection to import live tables. Files (CSV, Excel, JSON) and
            scans keep working without any connection.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => {
            const tables = tablesByConn[conn.id];
            const busy = busyId === conn.id;
            return (
              <div key={conn.id} className="nexora-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{conn.name}</p>
                      <p className="text-[11px] font-mono text-on-surface-variant">
                        {conn.type}
                        {conn.lastStatus === "ok" && (
                          <span className="text-emerald-400 ml-2 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> reachable
                          </span>
                        )}
                        {conn.lastStatus === "error" && (
                          <span className="text-red-400 ml-2 inline-flex items-center gap-1" title={conn.lastError}>
                            <AlertCircle className="w-3 h-3" /> failed
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleTest(conn)}
                      disabled={busy}
                      className="press px-3.5 py-2 rounded-lg border border-white/10 text-on-surface hover:bg-white/[0.06] text-[12px] cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
                      {busy ? "Working…" : "Test & list tables"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeConnection(conn.id)}
                      disabled={busy}
                      className="press px-3 py-2 rounded-lg border border-white/10 text-on-surface-variant hover:text-red-400 text-[12px] cursor-pointer disabled:opacity-40"
                      aria-label={`Remove ${conn.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {conn.lastStatus === "error" && conn.lastError && (
                  <p className="text-[11px] font-mono text-red-400/90 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2">
                    {conn.lastError}
                  </p>
                )}

                {tables && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-on-surface-variant font-mono">
                      {tables.length} table(s) — click to import the first 50k rows
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tables.slice(0, 30).map((t) => (
                        <button
                          key={t}
                          type="button"
                          disabled={busy}
                          onClick={() => handleImport(conn, `SELECT * FROM ${t} LIMIT 50000`, t)}
                          className="press px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-on-surface hover:border-primary/40 hover:text-primary text-[12px] font-mono cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                        >
                          <DownloadCloud className="w-3 h-3" />
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={queryByConn[conn.id] ?? ""}
                        onChange={(e) => setQueryByConn((prev) => ({ ...prev, [conn.id]: e.target.value }))}
                        placeholder="Or import a custom query: SELECT region, SUM(amount) FROM sales GROUP BY region"
                        className={inputCls}
                      />
                      <button
                        type="button"
                        disabled={busy || !(queryByConn[conn.id] ?? "").trim()}
                        onClick={() => handleImport(conn, queryByConn[conn.id] ?? "", "query")}
                        className="press px-4 py-2 rounded-lg bg-primary/12 border border-primary/20 text-primary hover:bg-primary/20 text-[12px] font-medium cursor-pointer disabled:opacity-40 shrink-0"
                      >
                        Import
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
