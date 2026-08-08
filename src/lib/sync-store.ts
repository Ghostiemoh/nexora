"use client";

/* Account and sync state, kept apart from the workspace store on purpose.
 *
 * The data key lives here in memory and is never persisted by this store. What
 * does persist is the account address, the sync bookmarks, and when the last sync
 * happened, none of which opens anything. Device trust is handled separately in
 * `device-key.ts`, where the wrapping key is non-extractable. */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  deriveSecrets,
  emptyKeyRing,
  generateDataKey,
  issueRecoveryCodes,
  unlockKeyRing,
  wrapDataKey,
  type WrappedKeyRing,
} from "./crypto";
import { forgetDevice, recallDataKey, trustDevice } from "./device-key";
import {
  createSupabaseTransport,
  getSupabase,
  isSyncConfigured,
  loadKeyRing,
  purgeRemoteWorkspace,
  saveKeyRing,
} from "./supabase-client";
import { runSync, type SyncBookmark } from "./sync-service";
import { buildSyncRecords, mergeRecipeBooks, parseRecipeBookEntry, type RecipeBookEntry } from "./sync-payload";
import { useNexora } from "./store";
import type { TeamMember } from "./types";

/** Where the account is in its lifecycle. The UI renders one stage at a time
 *  rather than guessing from a pile of booleans. */
export type SyncStage =
  /** this deployment has no Supabase credentials, so sync genuinely cannot work */
  | "unconfigured"
  | "signedOut"
  /** signed in, but this account has no key ring yet: first-run setup */
  | "needsSetup"
  /** signed in, key ring exists, this device cannot open it yet */
  | "locked"
  | "unlocked";

interface SyncStore {
  stage: SyncStage;
  email: string | null;
  userId: string | null;
  /** memory only, never persisted */
  dataKey: CryptoKey | null;
  /** shown once after setup, then dropped */
  freshRecoveryCodes: string[] | null;
  bookmarks: SyncBookmark[];
  /** recipes carried in from other devices */
  recipeBook: RecipeBookEntry[];
  lastSyncAt: number | null;
  lastSyncSummary: string | null;
  busy: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** first run: mint the data key and wrap it for this credential */
  completeSetup: (secret: string) => Promise<void>;
  unlock: (secret: string, remember: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
  untrustDevice: () => Promise<void>;
  purge: () => Promise<void>;
  dismissRecoveryCodes: () => void;
  clearError: () => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Whether the ring holds a slot a password could open, which is what separates
 *  "set up your passphrase" from "unlock this device". */
function ringHasCredential(ring: WrappedKeyRing | null): boolean {
  return Boolean(ring && (ring.password || ring.passphrase || ring.recovery.length > 0));
}

export const useSync = create<SyncStore>()(
  persist(
    (set, get) => ({
      stage: isSyncConfigured() ? "signedOut" : "unconfigured",
      email: null,
      userId: null,
      dataKey: null,
      freshRecoveryCodes: null,
      bookmarks: [],
      recipeBook: [],
      lastSyncAt: null,
      lastSyncSummary: null,
      busy: false,
      error: null,

      clearError: () => set({ error: null }),
      dismissRecoveryCodes: () => set({ freshRecoveryCodes: null }),

      /** Read the current session and decide which stage the UI should show.
       *  Called on mount and after the OAuth redirect lands. */
      refresh: async () => {
        const supabase = getSupabase();
        if (!supabase) {
          set({ stage: "unconfigured" });
          return;
        }

        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user?.email) {
          set({ stage: "signedOut", userId: null, dataKey: null });
          return;
        }

        set({ email: user.email, userId: user.id });

        try {
          const ring = await loadKeyRing(supabase, user.id);
          if (!ringHasCredential(ring)) {
            set({ stage: "needsSetup" });
            return;
          }

          // A device trusted earlier can open the vault with nothing typed.
          const remembered = await recallDataKey();
          set(remembered ? { stage: "unlocked", dataKey: remembered } : { stage: "locked" });
        } catch (error) {
          set({ stage: "locked", error: message(error) });
        }
      },

      signInWithGoogle: async () => {
        const supabase = getSupabase();
        if (!supabase) return;
        set({ busy: true, error: null });

        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/settings` },
        });
        // A successful call navigates away, so only the failure path returns.
        if (error) set({ busy: false, error: error.message });
      },

      signUpWithPassword: async (email, password) => {
        const supabase = getSupabase();
        if (!supabase) return;
        set({ busy: true, error: null });

        try {
          /* The provider receives a derived secret, never the password itself, so
           * it cannot derive the key that decrypts anything. */
          const { authSecret } = await deriveSecrets(password, email);
          const { error } = await supabase.auth.signUp({ email, password: authSecret });
          if (error) throw new Error(error.message);
          await get().refresh();
        } catch (error) {
          set({ error: message(error) });
        } finally {
          set({ busy: false });
        }
      },

      signInWithPassword: async (email, password) => {
        const supabase = getSupabase();
        if (!supabase) return;
        set({ busy: true, error: null });

        try {
          const { authSecret } = await deriveSecrets(password, email);
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password: authSecret,
          });
          if (error) throw new Error(error.message);
          await get().refresh();
        } catch (error) {
          set({ error: message(error) });
        } finally {
          set({ busy: false });
        }
      },

      completeSetup: async (secret) => {
        const supabase = getSupabase();
        const { userId, email } = get();
        if (!supabase || !userId || !email) return;
        set({ busy: true, error: null });

        try {
          const dataKey = await generateDataKey();
          const { wrappingKey } = await deriveSecrets(secret, email);
          const { codes, wrapped } = await issueRecoveryCodes(dataKey, email);

          const ring: WrappedKeyRing = {
            ...emptyKeyRing(),
            passphrase: await wrapDataKey(dataKey, wrappingKey),
            recovery: wrapped,
          };
          await saveKeyRing(supabase, userId, ring);
          await trustDevice(dataKey);

          set({ stage: "unlocked", dataKey, freshRecoveryCodes: codes });
          await get().syncNow();
        } catch (error) {
          set({ error: message(error) });
        } finally {
          set({ busy: false });
        }
      },

      unlock: async (secret, remember) => {
        const supabase = getSupabase();
        const { userId, email } = get();
        if (!supabase || !userId || !email) return;
        set({ busy: true, error: null });

        try {
          const ring = await loadKeyRing(supabase, userId);
          if (!ring) throw new Error("This account has no vault yet.");

          const dataKey = await unlockKeyRing(ring, secret.trim(), email);
          if (remember) await trustDevice(dataKey);

          set({ stage: "unlocked", dataKey });
          await get().syncNow();
        } catch (error) {
          set({ error: message(error) });
        } finally {
          set({ busy: false });
        }
      },

      syncNow: async () => {
        const supabase = getSupabase();
        const { userId, dataKey, bookmarks, recipeBook } = get();
        if (!supabase || !userId || !dataKey) return;
        set({ busy: true, error: null });

        try {
          const workspace = useNexora.getState();
          const outcome = await runSync({
            transport: createSupabaseTransport(supabase, userId),
            dataKey,
            records: buildSyncRecords({
              datasets: workspace.datasets,
              teamMembers: workspace.teamMembers,
              rosterUpdatedAt: get().lastSyncAt ?? 0,
            }),
            bookmarks,
            now: Date.now(),
          });

          // Adopt what came down. Recipes merge by schema; the roster replaces,
          // since it is one record rather than a set.
          let mergedBook = recipeBook;
          for (const envelope of outcome.pulled) {
            if (envelope.kind === "recipe") {
              mergedBook = mergeRecipeBooks(mergedBook, [parseRecipeBookEntry(envelope.payload)]);
            } else if (envelope.kind === "roster") {
              useNexora.setState({ teamMembers: envelope.payload as TeamMember[] });
            }
          }

          const parts = [
            outcome.pushed.length > 0 ? `${outcome.pushed.length} sent` : null,
            outcome.pulled.length > 0 ? `${outcome.pulled.length} received` : null,
            outcome.conflicts.length > 0 ? `${outcome.conflicts.length} conflict resolved` : null,
            outcome.rejected.length > 0 ? `${outcome.rejected.length} refused` : null,
          ].filter(Boolean);

          set({
            bookmarks: outcome.bookmarks,
            recipeBook: mergedBook,
            lastSyncAt: Date.now(),
            lastSyncSummary: parts.length > 0 ? parts.join(", ") : "Already up to date",
          });
        } catch (error) {
          set({ error: message(error) });
        } finally {
          set({ busy: false });
        }
      },

      signOut: async () => {
        const supabase = getSupabase();
        set({ busy: true });
        try {
          await forgetDevice();
          await supabase?.auth.signOut();
          set({
            stage: isSyncConfigured() ? "signedOut" : "unconfigured",
            userId: null,
            dataKey: null,
            bookmarks: [],
            recipeBook: [],
            lastSyncAt: null,
            lastSyncSummary: null,
            freshRecoveryCodes: null,
          });
        } finally {
          set({ busy: false });
        }
      },

      untrustDevice: async () => {
        await forgetDevice();
        set({ stage: "locked", dataKey: null });
      },

      purge: async () => {
        const supabase = getSupabase();
        const { userId } = get();
        if (!supabase || !userId) return;
        set({ busy: true, error: null });

        try {
          await purgeRemoteWorkspace(supabase, userId);
          await forgetDevice();
          set({
            stage: "needsSetup",
            dataKey: null,
            bookmarks: [],
            recipeBook: [],
            lastSyncAt: null,
            lastSyncSummary: "Everything on the server was deleted.",
          });
        } catch (error) {
          set({ error: message(error) });
        } finally {
          set({ busy: false });
        }
      },
    }),
    {
      name: "nexora-sync",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      /* The data key is absent by construction. Anything listed here is written
       * to disk, and none of it opens a vault. */
      partialize: (state) => ({
        email: state.email,
        userId: state.userId,
        bookmarks: state.bookmarks,
        recipeBook: state.recipeBook,
        lastSyncAt: state.lastSyncAt,
      }),
    }
  )
);
