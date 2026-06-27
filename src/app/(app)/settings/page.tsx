"use client";

import React, { useState } from "react";
import { 
  Database, 
  HardDrive, 
  Sliders, 
  Check, 
  AlertCircle, 
  Trash2, 
  RefreshCw, 
  Server, 
  Cpu, 
  Grid
} from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { useNexora } from "@/lib/store";
import { motion } from "framer-motion";

type TabType = "database" | "storage" | "workspace";

export default function SettingsPage() {
  const mounted = useMounted();
  const datasets = useNexora((s) => s.datasets);
  const removeDataset = useNexora((s) => s.removeDataset);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>("database");

  // Database Connection Form State
  const [dbConfig, setDbConfig] = useState({
    type: "postgresql",
    host: "db.nexora.cloud",
    port: "5432",
    database: "production_analytics",
    username: "nexora_read_replica",
    password: "••••••••••••••••••••"
  });
  
  const [testState, setTestState] = useState<"idle" | "loading" | "success" | "error">("idle");

  // Cache & Storage States
  const [cacheLimit, setCacheLimit] = useState("50MB");
  const [autoTrim, setAutoTrim] = useState(true);
  const [autoImpute, setAutoImpute] = useState(false);

  // Workspace Settings
  const [visualDensity, setVisualDensity] = useState("8"); // Default visual density dial
  const [themeMode, setThemeMode] = useState("charcoal-dark");

  if (!mounted) return null;

  // Simulate Database Connection Testing
  const handleTestConnection = (e: React.FormEvent) => {
    e.preventDefault();
    setTestState("loading");
    setTimeout(() => {
      // Simulate successful validation
      setTestState("success");
      setTimeout(() => setTestState("idle"), 3000);
    }, 1500);
  };

  // Purge datasets helper
  const handlePurgeCache = () => {
    if (confirm("Are you sure you want to purge all cached datasets from local storage? This cannot be undone.")) {
      datasets.forEach((d) => {
        removeDataset(d.id);
      });
      alert("Local storage cache cleared.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="p-8 max-w-5xl mx-auto space-y-8 select-none"
    >
      {/* Title */}
      <div className="border-b border-white/5 pb-6">
        <h2 className="text-3xl font-bold text-white tracking-tight leading-tight mb-1">
          Settings &amp; Configurations
        </h2>
        <p className="text-sm text-on-surface-variant">
          Adjust pipeline cache indices, local storage limits, and integration targets.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="md:col-span-1 flex flex-col gap-1.5 relative overflow-hidden bg-zinc-950/20 border border-white/5 p-2 rounded-2xl h-fit backdrop-blur-sm">
          {[
            { id: "database", label: "Integrations", icon: Database },
            { id: "storage", label: "Cache & Engine", icon: HardDrive },
            { id: "workspace", label: "Workspace", icon: Sliders }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`relative z-10 flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-mono uppercase tracking-wider font-bold transition-all cursor-pointer ${
                  isActive
                    ? "text-black"
                    : "text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="settings-tab-pill"
                    className="absolute inset-0 bg-primary rounded-xl border border-primary/20 -z-10 shadow-lg"
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Panels */}
        <div className="md:col-span-3">
          {activeTab === "database" && (
            <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-6 space-y-6 backdrop-blur-md shadow-xl">
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  Database Credentials
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Bind Nexora to live relational replica stores to execute direct client side queries.
                </p>
              </div>

              <form onSubmit={handleTestConnection} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                      Database Dialect
                    </label>
                    <select
                      value={dbConfig.type}
                      onChange={(e) => setDbConfig({ ...dbConfig, type: e.target.value })}
                      className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono cursor-pointer shadow-inner"
                    >
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mysql">MySQL</option>
                      <option value="snowflake">Snowflake DB</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                      Connection Endpoint
                    </label>
                    <input
                      type="text"
                      value={dbConfig.host}
                      onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                      className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono shadow-inner"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                      Access Port
                    </label>
                    <input
                      type="text"
                      value={dbConfig.port}
                      onChange={(e) => setDbConfig({ ...dbConfig, port: e.target.value })}
                      className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono shadow-inner"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                      Database Name
                    </label>
                    <input
                      type="text"
                      value={dbConfig.database}
                      onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                      className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono shadow-inner"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                      Credential ID
                    </label>
                    <input
                      type="text"
                      value={dbConfig.username}
                      onChange={(e) => setDbConfig({ ...dbConfig, username: e.target.value })}
                      className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono shadow-inner"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Secret Passphrase
                  </label>
                  <input
                    type="password"
                    value={dbConfig.password}
                    onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                    className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono shadow-inner"
                  />
                </div>

                <div className="pt-4 flex justify-between items-center gap-4 flex-wrap">
                  <div className="text-[10px] font-mono text-zinc-500 max-w-sm leading-relaxed uppercase tracking-wider">
                    Note: Connection details are stored client-side in secure cookie enclaves and never transit our host servers.
                  </div>
                  
                  <button
                    type="submit"
                    disabled={testState === "loading"}
                    className="px-5 py-2.5 bg-primary text-black font-bold hover:bg-primary/95 rounded-xl text-xs font-mono uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0 shadow-lg"
                  >
                    {testState === "loading" && (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    )}
                    {testState === "success" && (
                      <Check className="w-4 h-4" />
                    )}
                    {testState === "error" && (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    {testState === "idle" && "Validate Replica"}
                    {testState === "loading" && "Testing Link..."}
                    {testState === "success" && "Link Success!"}
                    {testState === "error" && "Link Failed"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "storage" && (
            <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-6 space-y-8 backdrop-blur-md shadow-xl">
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-primary" />
                  Cache Configuration
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Manage the local storage memory limits allocated to client-side database tables.
                </p>
              </div>

              {/* Memory Allocation */}
              <div className="space-y-6">
                <div className="flex justify-between items-center gap-4 flex-wrap">
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight">Guarded Storage Allocation</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed max-w-[40ch]">
                      Limit dataset sizes writing to localStorage. Overflows remain in tab session RAM.
                    </p>
                  </div>
                  <select
                    value={cacheLimit}
                    onChange={(e) => setCacheLimit(e.target.value)}
                    className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs font-mono cursor-pointer shadow-inner"
                  >
                    <option value="5MB">5 MB (Standard Browser)</option>
                    <option value="20MB">20 MB (Expanded Index)</option>
                    <option value="50MB">50 MB (High Density)</option>
                    <option value="unlimited">Tab RAM Only (Unlimited)</option>
                  </select>
                </div>

                <div className="h-px bg-white/5" />

                {/* Autotrim */}
                <div className="flex justify-between items-center gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight">Auto-Trim String Cells</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Remove leading/trailing spaces during file drops.
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoTrim(!autoTrim)}
                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${
                      autoTrim ? "bg-primary" : "bg-zinc-900"
                    } border border-white/10`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        autoTrim ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="h-px bg-white/5" />

                {/* Auto Impute */}
                <div className="flex justify-between items-center gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight">Auto-Impute Null Cells</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Attempt linear numeric interpolation during dataset profiling.
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoImpute(!autoImpute)}
                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${
                      autoImpute ? "bg-primary" : "bg-zinc-900"
                    } border border-white/10`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        autoImpute ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Cache Purge Panel */}
              <div className="bg-error-container/10 border border-error/20 p-5 rounded-2xl flex items-center justify-between gap-6 flex-wrap">
                <div>
                  <h4 className="text-sm font-bold text-error tracking-tight">Flush Store Indices</h4>
                  <p className="text-xs text-zinc-500 mt-1 max-w-[40ch] leading-relaxed">
                    This drops all local dataset records ({datasets.length} active tables) and resets the AI context log.
                  </p>
                </div>
                <button
                  onClick={handlePurgeCache}
                  className="px-4 py-2 bg-error/10 hover:bg-error/20 border border-error/30 text-error font-mono text-xs uppercase tracking-wider font-bold rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Purge Cache
                </button>
              </div>
            </div>
          )}

          {activeTab === "workspace" && (
            <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-6 space-y-6 backdrop-blur-md shadow-xl">
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Grid className="w-5 h-5 text-primary" />
                  Workspace Preferences
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Adjust default parameters for view ports, grid limits, and visual densities.
                </p>
              </div>

              <div className="space-y-6">
                {/* Visual Density */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-white tracking-tight">Visual Density Dial</label>
                    <span className="font-mono text-primary text-xs bg-primary/10 border border-primary/20 px-2 py-0.5 rounded font-bold">
                      Density {visualDensity}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={visualDensity}
                    onChange={(e) => setVisualDensity(e.target.value)}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                    <span>1 (Museum Gallery)</span>
                    <span>5 (Balanced)</span>
                    <span>10 (Cockpit Dense)</span>
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                {/* Active Profile */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-white tracking-tight">Active Theme Profile</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { id: "charcoal-dark", name: "Charcoal High Density" },
                      { id: "indigo-glass", name: "Indigo Glassmorphic" },
                      { id: "ocean-sleek", name: "Deep Ocean Sleek" }
                    ].map((prof) => (
                      <button
                        key={prof.id}
                        onClick={() => setThemeMode(prof.id)}
                        className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                          themeMode === prof.id
                            ? "bg-primary-container/10 border-primary text-white"
                            : "bg-zinc-950/20 border-white/5 text-on-surface-variant hover:border-white/10"
                        }`}
                      >
                        <span className="text-xs font-mono font-bold uppercase tracking-wider block">{prof.name}</span>
                        <span className="text-[10px] text-zinc-500 mt-2 block leading-relaxed">
                          {prof.id === "charcoal-dark" ? "High contrast dark" : prof.id === "indigo-glass" ? "Vibrant glass borders" : "Muted cool values"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
