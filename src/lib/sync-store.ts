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
  blindId,
  deriveSecrets,
  emptyKeyRing,
  generateDataKey,
  issueRecoveryCodes,
  unlockKeyRing,
  unlockWithWrappingKey,
  wrapDataKey,
  type WrappedKeyRing,
} from "./crypto";
import { forgetDevice, recallDataKey, trustDevice } from "./device-key";
import {
  createSupabaseTransport,
  downloadDatasetBlob,
  fetchEnabledProviders,
  getSupabase,
  isSyncConfigured,
  loadKeyRing,
  purgeRemoteWorkspace,
  saveKeyRing,
  uploadDatasetBlob,
} from "./supabase-client";
import { openDataset, sealDataset } from "./dataset-blob";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hashRecordContent,
  runSync,
  type SealedEnvelope,
  type SyncBookmark,
} from "./sync-service";
import {
  buildSyncRecords,
  mergeRecipeBooks,
  parseDatasetPointer,
  parseRecipeBookEntry,
  type RecipeBookEntry,
} from "./sync-payload";
import { useNexora } from "./store";
import type { Dataset, TeamMember } from "./types";

/** Where the account is in its lifecycle. The UI renders one stage at a time
 *  rather than guessing from a pile of booleans. */
export type SyncStage =
  /** this deployment has no Supabase credentials, so sync genuinely cannot work */
  | "unconfigured"
  | "signedOut"
  /** account created, but the provider requires a confirmed email before a session */
  | "awaitingConfirmation"
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
  /** Set while signing in with a password, whose derivation has already been paid
   *  for. Lets that path open or create the vault without asking for a second
   *  secret the reader does not need. Memory only, dropped on sign-out. */
  passwordWrappingKey: CryptoKey | null;
  /** shown once after setup, then dropped */
  freshRecoveryCodes: string[] | null;
  bookmarks: SyncBookmark[];
  /** recipes carried in from other devices */
  recipeBook: RecipeBookEntry[];
  lastSyncAt: number | null;
  lastSyncSummary: string | null;
  busy: boolean;
  error: string | null;
  /** Whether the project has the Google provider switched on. `null` means it
   *  has not been asked yet, which the panel treats as "do not offer it": a
   *  button that flickers into existence is worse than one that appears once. */
  googleAvailable: boolean | null;
  /** The reader chose to carry on without an account. Persisted, because being
   *  asked again on every visit is how an optional step stops feeling optional. */
  syncPromptDismissed: boolean;

  refresh: () => Promise<void>;
  dismissSyncPrompt: () => void;
  signInWithGoogle: () => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** First run: mint the data key and wrap it. Pass a passphrase for a Google
   *  account; omit it when a password sign-in already derived the key. */
  completeSetup: (secret?: string) => Promise<void>;
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

/** Fetch and open the blob a dataset record points at.
 *
 * `null` covers the two outcomes that are not failures. Either this device
 * already holds a copy at least as new, in which case downloading megabytes to
 * compare them would be waste; or the blob has not finished uploading from the
 * other device, in which case the record arrived first and the next sync will
 * find it. Neither is worth interrupting a sync over. */
async function adoptDataset(
  supabase: SupabaseClient,
  userId: string,
  dataKey: CryptoKey,
  envelope: SealedEnvelope
): Promise<Dataset | null> {
  const pointer = parseDatasetPointer(envelope.payload);

  const local = useNexora.getState().datasets.find((d) => d.id === pointer.datasetId);
  if (local && local.updatedAt >= pointer.updatedAt) return null;

  const bytes = await downloadDatasetBlob(
    supabase,
    userId,
    await blindId(dataKey, envelope.logicalId)
  );
  if (!bytes) return null;

  return openDataset(dataKey, bytes);
}

export const useSync = create<SyncStore>()(
  persist(
    (set, get) => ({
      stage: isSyncConfigured() ? "signedOut" : "unconfigured",
      email: null,
      userId: null,
      dataKey: null,
      passwordWrappingKey: null,
      freshRecoveryCodes: null,
      bookmarks: [],
      recipeBook: [],
      lastSyncAt: null,
      lastSyncSummary: null,
      busy: false,
      error: null,
      googleAvailable: null,
      syncPromptDismissed: false,

      clearError: () => set({ error: null }),
      dismissRecoveryCodes: () => set({ freshRecoveryCodes: null }),
      dismissSyncPrompt: () => set({ syncPromptDismissed: true }),

      /** Read the current session and decide which stage the UI should show.
       *  Called on mount and after the OAuth redirect lands. */
      refresh: async () => {
        const supabase = getSupabase();
        if (!supabase) {
          set({ stage: "unconfigured" });
          return;
        }

        /* Which providers exist is a property of the deployment rather than of
         * the reader, so it is asked once and not re-asked on later refreshes.
         * Deliberately not awaited: the session below decides what the reader
         * sees, and it should not wait on a question about a single button. */
        if (get().googleAvailable === null) {
          void fetchEnabledProviders().then((providers) =>
            set({ googleAvailable: providers.has("google") })
          );
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
          if (remembered) {
            set({ stage: "unlocked", dataKey: remembered });
            return;
          }

          /* A password sign-in has already derived the key that opens the vault,
           * so asking for anything more would be theatre. */
          const { passwordWrappingKey } = get();
          if (passwordWrappingKey && ring) {
            try {
              const dataKey = await unlockWithWrappingKey(ring, passwordWrappingKey);
              await trustDevice(dataKey);
              set({ stage: "unlocked", dataKey });
              void get().syncNow();
              return;
            } catch {
              // The ring predates this password, so fall through and ask.
            }
          }

          set({ stage: "locked" });
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
           * it cannot derive the key that decrypts anything. The second
           * derivation is kept in memory so setup can wrap the data key without
           * asking for a passphrase this account does not need. */
          const { authSecret, wrappingKey } = await deriveSecrets(password, email);
          const { data, error } = await supabase.auth.signUp({ email, password: authSecret });
          if (error) throw new Error(error.message);

          set({ passwordWrappingKey: wrappingKey, email });

          /* With email confirmation enabled, which is the Supabase default, a
           * sign-up returns a user but no session. Saying so beats a button that
           * appears to do nothing. */
          if (!data.session) {
            set({ stage: "awaitingConfirmation" });
            return;
          }

          await get().refresh();
          if (get().stage === "needsSetup") await get().completeSetup();
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
          const { authSecret, wrappingKey } = await deriveSecrets(password, email);
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password: authSecret,
          });
          if (error) throw new Error(error.message);

          // `refresh` uses this to open the vault without a second prompt.
          set({ passwordWrappingKey: wrappingKey });
          await get().refresh();
        } catch (error) {
          set({ error: message(error) });
        } finally {
          set({ busy: false });
        }
      },

      completeSetup: async (secret) => {
        const supabase = getSupabase();
        const { userId, email, passwordWrappingKey } = get();
        if (!supabase || !userId || !email) return;
        set({ busy: true, error: null });

        try {
          /* Two routes in. A password sign-in already derived a key, so it fills
           * the password slot and the reader manages one secret. Google supplies
           * no secret at all, so a passphrase fills its own slot. */
          const usingPassword = !secret && Boolean(passwordWrappingKey);
          if (!usingPassword && !secret) {
            throw new Error("A passphrase is required to create the vault.");
          }

          const dataKey = await generateDataKey();
          const wrappingKey = usingPassword
            ? passwordWrappingKey!
            : (await deriveSecrets(secret!, email)).wrappingKey;
          const { codes, wrapped } = await issueRecoveryCodes(dataKey, email);

          const wrappedForCredential = await wrapDataKey(dataKey, wrappingKey);
          const ring: WrappedKeyRing = {
            ...emptyKeyRing(),
            ...(usingPassword
              ? { password: wrappedForCredential }
              : { passphrase: wrappedForCredential }),
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
          const records = buildSyncRecords({
            datasets: workspace.datasets,
            teamMembers: workspace.teamMembers,
            rosterUpdatedAt: workspace.teamUpdatedAt,
          });

          /* Blobs go up before the records that point at them. A pointer landing
           * first would be a promise this device had not yet kept, and the second
           * device would show a dataset it cannot open.
           *
           * Only what actually changed is uploaded. The comparison is the same
           * content hash the engine uses for records, so a dataset whose
           * `updatedAt` moved without its contents changing costs nothing. */
          const seen = new Map(bookmarks.map((bookmark) => [bookmark.logicalId, bookmark]));
          for (const record of records) {
            if (record.kind !== "dataset") continue;

            const hash = await hashRecordContent(record.kind, record.payload);
            if (seen.get(record.logicalId)?.contentHash === hash) continue;

            const pointer = parseDatasetPointer(record.payload);
            const dataset = workspace.datasets.find((d) => d.id === pointer.datasetId);
            if (!dataset) continue;

            await uploadDatasetBlob(
              supabase,
              userId,
              await blindId(dataKey, record.logicalId),
              await sealDataset(dataKey, dataset)
            );
          }

          const outcome = await runSync({
            transport: createSupabaseTransport(supabase, userId),
            dataKey,
            records,
            bookmarks,
            now: Date.now(),
          });

          // Adopt what came down. Recipes merge by schema; the roster replaces,
          // since it is one record rather than a set.
          let mergedBook = recipeBook;
          const arrived: (Dataset | null)[] = [];
          for (const envelope of outcome.pulled) {
            if (envelope.kind === "recipe") {
              mergedBook = mergeRecipeBooks(mergedBook, [parseRecipeBookEntry(envelope.payload)]);
            } else if (envelope.kind === "roster") {
              /* Adopt the incoming edit time too, otherwise this device looks
               * like it changed the roster the moment it received one. */
              useNexora.setState({
                teamMembers: envelope.payload as TeamMember[],
                teamUpdatedAt: envelope.updatedAt,
              });
            } else if (envelope.kind === "dataset") {
              arrived.push(await adoptDataset(supabase, userId, dataKey, envelope));
            }
          }

          /* One write for all of them. Adopting datasets one at a time would
           * re-render the workspace once per arrival, and a first sync onto a
           * fresh device can carry a dozen. */
          const adopted = arrived.filter((dataset): dataset is Dataset => dataset !== null);
          if (adopted.length > 0) {
            const byId = new Map(useNexora.getState().datasets.map((d) => [d.id, d]));
            for (const dataset of adopted) byId.set(dataset.id, dataset);
            useNexora.setState({ datasets: [...byId.values()] });
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
            passwordWrappingKey: null,
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
        // The derived password key would re-open the vault on the next refresh,
        // which is the opposite of what "forget this device" means.
        set({ stage: "locked", dataKey: null, passwordWrappingKey: null });
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
        syncPromptDismissed: state.syncPromptDismissed,
      }),
    }
  )
);
