"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { applyCleanOp } from "./clean";
import { replayRecipe } from "./recipe";
import { profileDataset } from "./profile";
import { generateSampleDataset } from "./sample";
import { joinDatasets } from "./joiner";
import { queryAxiom } from "./axiom";
import type {
  CleanOp, Dataset, Row, ChatMessage, TeamMember, SupportTicket,
  AppNotification, AuditEntry, ExportRecord, DbConnection,
} from "./types";

interface NexoraState {
  datasets: Dataset[];
  activeId: string | null;
  chatHistory: Record<string, ChatMessage[]>; // datasetId -> messages
  teamMembers: TeamMember[];
  tickets: SupportTicket[];
  notifications: AppNotification[];
  auditLog: AuditEntry[];
  exportHistory: ExportRecord[];
  connections: DbConnection[];
  settings: { geminiApiKey: string };

  // Platform actions
  notify: (level: AppNotification["level"], title: string, message: string) => void;
  markNotificationsRead: () => void;
  clearNotifications: () => void;
  logAudit: (action: string, detail: string, datasetId?: string) => void;
  recordExport: (rec: Omit<ExportRecord, "id" | "at">) => void;
  addConnection: (conn: Omit<DbConnection, "id">) => string;
  updateConnection: (id: string, patch: Partial<DbConnection>) => void;
  removeConnection: (id: string) => void;
  setGeminiApiKey: (key: string) => void;
  /** append a chat message; id and timestamp are stamped here */
  pushChatMessage: (datasetId: string, msg: Omit<ChatMessage, "id" | "at">) => void;

  // Core Actions
  addDataset: (name: string, columns: string[], rows: Row[], truncated?: boolean) => string;
  loadSample: () => string;
  setActive: (id: string) => void;
  removeDataset: (id: string) => void;
  applyFix: (datasetId: string, op: CleanOp) => string;
  undoFix: (datasetId: string) => string;
  applyRecipe: (datasetId: string, ops: CleanOp[]) => string;
  /** per-dataset undo depth available (in-memory only) */
  undoDepth: (datasetId: string) => number;
  joinDatasets: (
    name: string,
    leftId: string,
    rightId: string,
    leftKey: string,
    rightKey: string,
    joinType: "inner" | "left" | "right" | "full"
  ) => string;

  // Chat Actions
  addChatMessage: (datasetId: string, text: string) => void;
  clearChat: (datasetId: string) => void;

  // Team Actions
  addTeamMember: (member: Omit<TeamMember, "id" | "bgClass" | "initials">) => void;
  removeTeamMember: (id: string) => void;

  // Support Actions
  addTicket: (ticket: Omit<SupportTicket, "id" | "status" | "date">) => void;
  removeTicket: (id: string) => void;
}

function makeId() {
  return `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* Undo snapshots live outside the persisted store: they're big (full row
 * copies) and only meaningful within a session. Capped per dataset. */
const UNDO_CAP = 10;
interface UndoSnapshot {
  rows: Row[];
  columns: string[];
  changelog: string[];
  recipe: CleanOp[];
}
const undoStacks = new Map<string, UndoSnapshot[]>();

function pushUndo(datasetId: string, snap: UndoSnapshot) {
  const stack = undoStacks.get(datasetId) ?? [];
  stack.push(snap);
  if (stack.length > UNDO_CAP) stack.shift();
  undoStacks.set(datasetId, stack);
}

/** localStorage with quota guard — large datasets stay in memory only */
const guardedStorage = createJSONStorage(() => ({
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      if (v.length < 3500000) {
        localStorage.setItem(k, v);
      } else {
        localStorage.removeItem(k);
      }
    } catch {
      /* quota exceeded — keep in memory only */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
}));

const defaultTeamMembers: TeamMember[] = [
  {
    id: "mem_1",
    name: "Muhammad",
    role: "Lead Architect",
    email: "muhammad@nexora.io",
    roleType: "Owner",
    initials: "MH",
    bgClass: "bg-primary/10 border-primary/20 text-primary",
  },
  {
    id: "mem_2",
    name: "Axiom Analyst",
    role: "AI Core Intelligence",
    email: "axiom@nexora.io",
    roleType: "Engine",
    initials: "AX",
    bgClass: "bg-tertiary/10 border-tertiary/20 text-tertiary",
  },
  {
    id: "mem_3",
    name: "Sarah Jenkins",
    role: "Database Administrator",
    email: "sarah.j@nexora.io",
    roleType: "Editor",
    initials: "SJ",
    bgClass: "bg-secondary/10 border-secondary/20 text-secondary",
  },
];

const defaultTickets: SupportTicket[] = [
  {
    id: "TK-9402",
    title: "SQL parser failure on OUTER JOIN aggregation",
    description: "The SQL parser fails to resolve grouping aliases when evaluating full outer joins on client-side structures.",
    category: "SQL Sandbox",
    severity: "high",
    status: "Investigating",
    date: "2026-06-12",
  },
  {
    id: "TK-8192",
    title: "RAM cache overflow on large 120MB CSV drops",
    description: "Loading files larger than 100MB directly causes browser memory exhaustion during categorical distribution profiles.",
    category: "Cache Engine",
    severity: "medium",
    status: "Resolved",
    date: "2026-06-10",
  },
];

export const useNexora = create<NexoraState>()(
  persist(
    (set, get) => ({
      datasets: [],
      activeId: null,
      chatHistory: {},
      teamMembers: defaultTeamMembers,
      tickets: defaultTickets,
      notifications: [],
      auditLog: [],
      exportHistory: [],
      connections: [],
      settings: { geminiApiKey: "" },

      notify: (level, title, message) => {
        const n: AppNotification = {
          id: `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          at: Date.now(),
          level,
          title,
          message,
          read: false,
        };
        set((state) => ({ notifications: [n, ...state.notifications].slice(0, 50) }));
      },

      markNotificationsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => (n.read ? n : { ...n, read: true })),
        }));
      },

      clearNotifications: () => set({ notifications: [] }),

      logAudit: (action, detail, datasetId) => {
        const ds = datasetId ? get().datasets.find((d) => d.id === datasetId) : undefined;
        const entry: AuditEntry = {
          id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          at: Date.now(),
          action,
          detail,
          datasetId,
          datasetName: ds?.name,
        };
        set((state) => ({ auditLog: [entry, ...state.auditLog].slice(0, 300) }));
      },

      recordExport: (rec) => {
        const entry: ExportRecord = {
          ...rec,
          // Text payloads are kept for one-click re-download; keep the quota safe.
          content: rec.content && rec.content.length < 200_000 ? rec.content : undefined,
          id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          at: Date.now(),
        };
        set((state) => ({ exportHistory: [entry, ...state.exportHistory].slice(0, 100) }));
        get().logAudit("export", `Exported ${rec.filename} (${rec.kind}).`, rec.datasetId);
      },

      addConnection: (conn) => {
        const id = `con_${Date.now().toString(36)}`;
        set((state) => ({ connections: [...state.connections, { ...conn, id }] }));
        get().logAudit("connection", `Added ${conn.type} connection '${conn.name}'.`);
        return id;
      },

      updateConnection: (id, patch) => {
        // Status changes get their check-time stamped here, keeping Date.now
        // out of component render scopes.
        const stamped = patch.lastStatus ? { ...patch, lastCheckedAt: Date.now() } : patch;
        set((state) => ({
          connections: state.connections.map((c) => (c.id === id ? { ...c, ...stamped } : c)),
        }));
      },

      removeConnection: (id) => {
        const conn = get().connections.find((c) => c.id === id);
        set((state) => ({ connections: state.connections.filter((c) => c.id !== id) }));
        if (conn) get().logAudit("connection", `Removed connection '${conn.name}'.`);
      },

      setGeminiApiKey: (key) => set({ settings: { geminiApiKey: key } }),

      pushChatMessage: (datasetId, msg) => {
        const stamped: ChatMessage = {
          ...msg,
          id: `msg_${msg.role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          at: Date.now(),
        };
        set((state) => ({
          chatHistory: {
            ...state.chatHistory,
            [datasetId]: [...(state.chatHistory[datasetId] || []), stamped],
          },
        }));
      },

      addDataset: (name, columns, rows, truncated = false) => {
        const id = makeId();
        const newDataset = profileDataset({
          id,
          name,
          columns,
          rows,
          createdAt: Date.now(),
          changelog: ["Dataset imported successfully."],
          truncated,
        });

        // Initialize empty chat history for this dataset
        const initialWelcome: ChatMessage = {
          id: `msg_welcome_${Date.now()}`,
          role: "system",
          text: `Session attached to ${name}. The dataset has ${rows.length} rows and ${columns.length} columns. Ask me anything!`,
          at: Date.now(),
        };

        set((state) => ({
          datasets: [...state.datasets, newDataset],
          activeId: id,
          chatHistory: {
            ...state.chatHistory,
            [id]: [initialWelcome],
          },
        }));

        get().logAudit("import", `Imported '${name}' (${rows.length} rows, ${columns.length} columns).`, id);
        if (newDataset.health.overall < 70) {
          get().notify(
            "warning",
            "Low data health",
            `'${name}' scored ${newDataset.health.overall}% — ${newDataset.diagnostics.length} issue(s) found. Open Dataset Doctor to fix them.`
          );
        } else {
          get().notify("success", "Dataset imported", `'${name}' is ready (health ${newDataset.health.overall}%).`);
        }

        return id;
      },

      loadSample: () => {
        const sample = generateSampleDataset();
        // Check if sample dataset is already loaded
        const existing = get().datasets.find((d) => d.name === sample.name);
        if (existing) {
          get().setActive(existing.id);
          return existing.id;
        }
        return get().addDataset(sample.name, sample.columns, sample.rows);
      },

      setActive: (id) => {
        set({ activeId: id });
      },

      removeDataset: (id) => {
        set((state) => {
          const nextDatasets = state.datasets.filter((d) => d.id !== id);
          const nextActiveId =
            state.activeId === id
              ? nextDatasets.length > 0
                ? nextDatasets[0].id
                : null
              : state.activeId;
              
          const nextChatHistory = { ...state.chatHistory };
          delete nextChatHistory[id];

          return {
            datasets: nextDatasets,
            activeId: nextActiveId,
            chatHistory: nextChatHistory,
          };
        });
      },

      applyFix: (datasetId, op) => {
        const dataset = get().datasets.find((d) => d.id === datasetId);
        if (!dataset) return "Dataset not found";

        const cleanedRows = applyCleanOp(dataset.rows, op);

        let logMsg = "";
        if (op.kind === "dropDuplicates") {
          logMsg = `Removed ${dataset.duplicateRows} duplicate rows.`;
        } else if (op.kind === "dropEmptyRows") {
          logMsg = "Removed completely empty rows.";
        } else if (op.kind === "trimWhitespace") {
          logMsg = "Normalized spacing in all text columns.";
        } else if (op.kind === "fillMissing") {
          logMsg = `Imputed missing values in column '${op.column}' via ${op.strategy}.`;
        } else if (op.kind === "fixEncoding") {
          logMsg = "Repaired broken text encoding (mojibake) across text columns.";
        } else if (op.kind === "standardizeCase") {
          logMsg = `Standardized casing in column '${op.column}'.`;
        } else if (op.kind === "mergeValues") {
          logMsg = `Merged ${Object.keys(op.mapping).length} variant value(s) in column '${op.column}'.`;
        } else if (op.kind === "convertExcelDates") {
          logMsg = `Converted Excel serial numbers in '${op.column}' to real dates.`;
        } else if (op.kind === "dropColumn") {
          logMsg = `Dropped index column '${op.column}'.`;
        } else if (op.kind === "findReplace") {
          logMsg = `Replaced "${op.find}" with "${op.replace}" in ${op.column ? `column '${op.column}'` : "all text columns"}.`;
        } else if (op.kind === "splitColumn") {
          logMsg = `Split column '${op.column}' on "${op.delimiter}" (Text to Columns).`;
        }

        let nextColumns = dataset.columns;
        if (op.kind === "dropColumn") {
          nextColumns = dataset.columns.filter((c) => c !== op.column);
        } else if (op.kind === "splitColumn" && cleanedRows.length > 0) {
          nextColumns = Object.keys(cleanedRows[0]);
        }

        // Snapshot for undo, then record the op into the dataset's recipe.
        pushUndo(datasetId, {
          rows: dataset.rows,
          columns: dataset.columns,
          changelog: dataset.changelog,
          recipe: dataset.recipe ?? [],
        });

        const updatedDataset = profileDataset({
          id: dataset.id,
          name: dataset.name,
          columns: nextColumns,
          rows: cleanedRows,
          createdAt: dataset.createdAt,
          changelog: [...dataset.changelog, logMsg],
          truncated: dataset.truncated,
        });
        updatedDataset.recipe = [...(dataset.recipe ?? []), op];

        // Add system message about the fix
        const fixMsg: ChatMessage = {
          id: `msg_fix_${Date.now()}`,
          role: "system",
          text: `Applied Fix: ${logMsg} New health score is ${updatedDataset.health.overall}%.`,
          at: Date.now(),
        };

        set((state) => ({
          datasets: state.datasets.map((d) => (d.id === datasetId ? updatedDataset : d)),
          chatHistory: {
            ...state.chatHistory,
            [datasetId]: [...(state.chatHistory[datasetId] || []), fixMsg],
          },
        }));

        get().logAudit("fix", logMsg, datasetId);
        return "Success";
      },

      undoFix: (datasetId) => {
        const dataset = get().datasets.find((d) => d.id === datasetId);
        const stack = undoStacks.get(datasetId);
        if (!dataset || !stack || stack.length === 0) return "Nothing to undo";

        const snap = stack.pop()!;
        const restored = profileDataset({
          id: dataset.id,
          name: dataset.name,
          columns: snap.columns,
          rows: snap.rows,
          createdAt: dataset.createdAt,
          changelog: [...snap.changelog, "Undid the last cleaning operation."],
          truncated: dataset.truncated,
        });
        restored.recipe = snap.recipe;

        set((state) => ({
          datasets: state.datasets.map((d) => (d.id === datasetId ? restored : d)),
        }));
        get().logAudit("undo", "Undid the last cleaning operation.", datasetId);
        return "Success";
      },

      undoDepth: (datasetId) => undoStacks.get(datasetId)?.length ?? 0,

      applyRecipe: (datasetId, ops) => {
        const dataset = get().datasets.find((d) => d.id === datasetId);
        if (!dataset) return "Dataset not found";

        pushUndo(datasetId, {
          rows: dataset.rows,
          columns: dataset.columns,
          changelog: dataset.changelog,
          recipe: dataset.recipe ?? [],
        });

        const result = replayRecipe(dataset.rows, dataset.columns, ops);
        const logMsg = `Replayed a cleaning recipe: ${result.applied} op(s) applied${
          result.skipped > 0 ? `, ${result.skipped} skipped (missing columns)` : ""
        }.`;

        const updatedDataset = profileDataset({
          id: dataset.id,
          name: dataset.name,
          columns: result.columns,
          rows: result.rows,
          createdAt: dataset.createdAt,
          changelog: [...dataset.changelog, logMsg],
          truncated: dataset.truncated,
        });
        updatedDataset.recipe = [...(dataset.recipe ?? []), ...ops];

        set((state) => ({
          datasets: state.datasets.map((d) => (d.id === datasetId ? updatedDataset : d)),
        }));
        get().logAudit("recipe", logMsg, datasetId);
        get().notify("success", "Recipe replayed", logMsg);
        return `Applied ${result.applied} operation(s)${result.skipped ? `, skipped ${result.skipped}` : ""}`;
      },

      joinDatasets: (name, leftId, rightId, leftKey, rightKey, joinType) => {
        const leftDs = get().datasets.find((d) => d.id === leftId);
        const rightDs = get().datasets.find((d) => d.id === rightId);
        if (!leftDs || !rightDs) return "Dataset not found";

        const result = joinDatasets(
          leftDs.rows,
          leftDs.columns,
          rightDs.rows,
          rightDs.columns,
          leftKey,
          rightKey,
          joinType
        );

        const id = makeId();
        const dataset = profileDataset({
          id,
          name,
          columns: result.columns,
          rows: result.rows,
          createdAt: Date.now(),
          changelog: [
            `Joined ${leftDs.name} and ${rightDs.name} on ${leftKey} = ${rightKey} (${joinType} join).`,
          ],
          truncated: leftDs.truncated || rightDs.truncated,
        });

        const initialWelcome: ChatMessage = {
          id: `msg_welcome_${Date.now()}`,
          role: "system",
          text: `Joined Dataset Session attached. Derived from ${leftDs.name} + ${rightDs.name}.`,
          at: Date.now(),
        };

        set((state) => ({
          datasets: [...state.datasets, dataset],
          activeId: id,
          chatHistory: {
            ...state.chatHistory,
            [id]: [initialWelcome],
          },
        }));

        get().logAudit(
          "join",
          `Joined ${leftDs.name} + ${rightDs.name} on ${leftKey} = ${rightKey} (${joinType}) → '${name}'.`,
          id
        );

        return id;
      },

      addChatMessage: (datasetId, text) => {
        const dataset = get().datasets.find((d) => d.id === datasetId);
        const userMsg: ChatMessage = {
          id: `msg_user_${Date.now()}`,
          role: "user",
          text,
          at: Date.now(),
        };

        // Axiom AI evaluation
        const aiAnswer = queryAxiom(text, dataset || null);
        const aiMsg: ChatMessage = {
          id: `msg_ai_${Date.now() + 50}`,
          role: "axiom",
          text: aiAnswer.text,
          table: aiAnswer.table,
          suggestions: aiAnswer.suggestions,
          at: Date.now() + 50,
        };

        set((state) => ({
          chatHistory: {
            ...state.chatHistory,
            [datasetId]: [...(state.chatHistory[datasetId] || []), userMsg, aiMsg],
          },
        }));
      },

      clearChat: (datasetId) => {
        const dataset = get().datasets.find((d) => d.id === datasetId);
        const welcome: ChatMessage = {
          id: `msg_welcome_${Date.now()}`,
          role: "system",
          text: dataset
            ? `Session attached to ${dataset.name}. Ask me anything!`
            : "No active dataset loaded.",
          at: Date.now(),
        };
        set((state) => ({
          chatHistory: {
            ...state.chatHistory,
            [datasetId]: [welcome],
          },
        }));
      },

      addTeamMember: (member) => {
        const id = `mem_${Date.now().toString(36)}`;
        const names = member.name.trim().split(/\s+/);
        const initials = names.length > 1
          ? (names[0][0] + names[1][0]).toUpperCase()
          : names[0].slice(0, 2).toUpperCase();

        const colors = [
          "bg-primary/10 border-primary/20 text-primary",
          "bg-secondary/10 border-secondary/20 text-secondary",
          "bg-tertiary/10 border-tertiary/20 text-tertiary",
          "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        ];
        const bgClass = colors[Math.floor(Math.random() * colors.length)];

        set((state) => ({
          teamMembers: [
            ...state.teamMembers,
            { ...member, id, initials, bgClass }
          ]
        }));
      },

      removeTeamMember: (id) => {
        set((state) => ({
          teamMembers: state.teamMembers.filter((m) => m.id !== id)
        }));
      },

      addTicket: (ticket) => {
        const id = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
        const date = new Date().toISOString().split("T")[0];
        set((state) => ({
          tickets: [
            { ...ticket, id, status: "Open", date },
            ...state.tickets
          ]
        }));
      },

      removeTicket: (id) => {
        set((state) => ({
          tickets: state.tickets.filter((t) => t.id !== id)
        }));
      },
    }),
    {
      name: "nexora-state",
      storage: guardedStorage,
      // v2: profiling model gained accuracy/quantiles/outliers/date-range.
      // v3: detectors for index columns, mojibake, casing, category variants,
      // and Excel serial dates. Re-profile persisted datasets on rehydrate.
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as Partial<NexoraState> | undefined;
        if (state?.datasets && version < 3) {
          state.datasets = state.datasets.map((d) =>
            profileDataset({
              id: d.id,
              name: d.name,
              columns: d.columns,
              rows: d.rows,
              createdAt: d.createdAt,
              changelog: d.changelog,
              truncated: d.truncated,
            })
          );
        }
        return state as NexoraState;
      },
      partialize: (state) => ({
        datasets: state.datasets,
        activeId: state.activeId,
        chatHistory: state.chatHistory,
        teamMembers: state.teamMembers,
        tickets: state.tickets,
        notifications: state.notifications,
        auditLog: state.auditLog,
        exportHistory: state.exportHistory,
        connections: state.connections,
        settings: state.settings,
      }),
    }
  )
);
