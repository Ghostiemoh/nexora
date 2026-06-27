"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { applyCleanOp } from "./clean";
import { profileDataset } from "./profile";
import { generateSampleDataset } from "./sample";
import { joinDatasets } from "./joiner";
import { queryAxiom } from "./axiom";
import type { CleanOp, Dataset, Row, ChatMessage } from "./types";

interface NexoraState {
  datasets: Dataset[];
  activeId: string | null;
  chatHistory: Record<string, ChatMessage[]>; // datasetId -> messages

  // Core Actions
  addDataset: (name: string, columns: string[], rows: Row[], truncated?: boolean) => string;
  loadSample: () => string;
  setActive: (id: string) => void;
  removeDataset: (id: string) => void;
  applyFix: (datasetId: string, op: CleanOp) => string;
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
}

function makeId() {
  return `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
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

export const useNexora = create<NexoraState>()(
  persist(
    (set, get) => ({
      datasets: [],
      activeId: null,
      chatHistory: {},

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
          logMsg = "Trimmed leading/trailing whitespaces in all text columns.";
        } else if (op.kind === "fillMissing") {
          logMsg = `Imputed missing values in column '${op.column}' via ${op.strategy}.`;
        }

        const updatedDataset = profileDataset({
          id: dataset.id,
          name: dataset.name,
          columns: dataset.columns,
          rows: cleanedRows,
          createdAt: dataset.createdAt,
          changelog: [...dataset.changelog, logMsg],
          truncated: dataset.truncated,
        });

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

        return "Success";
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
    }),
    {
      name: "nexora-state",
      storage: guardedStorage,
      partialize: (state) => ({
        datasets: state.datasets,
        activeId: state.activeId,
        chatHistory: state.chatHistory,
      }),
    }
  )
);
