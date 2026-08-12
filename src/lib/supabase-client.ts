/* The only module that talks to a server.
 *
 * Two rules it exists to enforce. First, if the deployment has no Supabase
 * credentials then sync is genuinely unavailable and says so, rather than
 * presenting a sign-in that cannot work: a previous version of this app shipped
 * simulated authentication and the audit was right to call it out.
 *
 * Second, this file only ever handles ciphertext. Sealing happens in
 * `sync-service.ts` before anything reaches the transport, so no change here can
 * accidentally put a readable payload on the wire. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Sealed, WrappedKeyRing } from "./crypto";
import type { SyncTransport, TransportRecord } from "./sync-service";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether this deployment can sync at all. The UI asks first and stays honest
 *  about the answer. */
export function isSyncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The OAuth redirect comes back with the grant in the URL.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

/** Which third-party sign-in providers this project actually has switched on.
 *
 * Worth asking, because a button for a disabled provider does not fail politely.
 * Supabase answers the authorize redirect with a bare
 * `{"error_code":"validation_failed","msg":"Unsupported provider: provider is
 * not enabled"}` document: the reader has left the app, is looking at raw JSON,
 * and the only way back is the browser's back button. Not offering the button is
 * the whole fix.
 *
 * `/auth/v1/settings` is public, needs no session, and answers with the
 * publishable key alone. If the request fails we report nothing as enabled and
 * fall back to email, which is always available and always works — a network
 * blip should not be able to hide the sign-in the reader came for. */
export async function fetchEnabledProviders(): Promise<Set<string>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return new Set();

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return new Set();

    const body = (await response.json()) as { external?: Record<string, boolean> };
    return new Set(
      Object.entries(body.external ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
    );
  } catch {
    return new Set();
  }
}

/* ── the vault ── */

export async function loadKeyRing(
  supabase: SupabaseClient,
  userId: string
): Promise<WrappedKeyRing | null> {
  const { data, error } = await supabase
    .from("sync_vault")
    .select("wrapped_keys")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.wrapped_keys as WrappedKeyRing | undefined) ?? null;
}

export async function saveKeyRing(
  supabase: SupabaseClient,
  userId: string,
  ring: WrappedKeyRing
): Promise<void> {
  const { error } = await supabase
    .from("sync_vault")
    .upsert({ user_id: userId, wrapped_keys: ring, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
}

/* ── the record transport ── */

interface RecordRow {
  record_id: string;
  revision: number;
  content_updated_at: number;
  deleted: boolean;
}

/** Row-level security already restricts every query to the signed-in user, so
 *  `user_id` here is belt and braces rather than the mechanism. */
export function createSupabaseTransport(
  supabase: SupabaseClient,
  userId: string
): SyncTransport {
  return {
    async list(): Promise<TransportRecord[]> {
      const { data, error } = await supabase
        .from("sync_records")
        .select("record_id, revision, content_updated_at, deleted")
        .eq("user_id", userId);

      if (error) throw new Error(error.message);

      return ((data ?? []) as RecordRow[]).map((row) => ({
        id: row.record_id,
        revision: Number(row.revision),
        contentUpdatedAt: Number(row.content_updated_at),
        deleted: row.deleted,
      }));
    },

    async get(id: string): Promise<Sealed | null> {
      const { data, error } = await supabase
        .from("sync_records")
        .select("iv, ciphertext, deleted")
        .eq("user_id", userId)
        .eq("record_id", id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data || data.deleted) return null;

      return { version: 1, iv: data.iv as string, ciphertext: data.ciphertext as string };
    },

    async put(id: string, sealed: Sealed, contentUpdatedAt: number): Promise<void> {
      // `revision` is deliberately absent: the database assigns it, so no device
      // can claim to be further ahead than it is.
      const { error } = await supabase.from("sync_records").upsert(
        {
          user_id: userId,
          record_id: id,
          iv: sealed.iv,
          ciphertext: sealed.ciphertext,
          content_updated_at: contentUpdatedAt,
          deleted: false,
        },
        { onConflict: "user_id,record_id" }
      );

      if (error) throw new Error(error.message);
    },

    async remove(id: string, contentUpdatedAt: number): Promise<void> {
      /* Tombstone rather than delete. A hard delete is invisible to the other
       * devices, which would each re-upload their copy and resurrect it. */
      const { error } = await supabase.from("sync_records").upsert(
        {
          user_id: userId,
          record_id: id,
          iv: "",
          ciphertext: "",
          content_updated_at: contentUpdatedAt,
          deleted: true,
        },
        { onConflict: "user_id,record_id" }
      );

      if (error) throw new Error(error.message);
    },
  };
}

/** Remove every trace of this account's data from the server. Offered in
 *  Settings, because an account you cannot empty is not really opt-in. */
export async function purgeRemoteWorkspace(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  /* Blobs first. If this throws, the records that point at them are still
   * present, and a retry knows what to delete. Clearing the pointers first would
   * strand every blob in the bucket with nothing left referring to it. */
  await removeAllDatasetBlobs(supabase, userId);

  const records = await supabase.from("sync_records").delete().eq("user_id", userId);
  if (records.error) throw new Error(records.error.message);

  const vault = await supabase.from("sync_vault").delete().eq("user_id", userId);
  if (vault.error) throw new Error(vault.error.message);
}

/* ── dataset blobs ──
 *
 * Datasets are too large for `sync_records` and live in a private bucket
 * instead, one object per dataset at `<user id>/<blinded id>`. That first path
 * segment is what the bucket's policies check, so the path is not a convenience
 * — it is the access control.
 *
 * Everything here handles sealed bytes only. `dataset-blob.ts` compresses and
 * seals before anything reaches this file, exactly as `sync-service.ts` does for
 * records, so no change here can put a readable row on the wire. */

const DATASET_BUCKET = "datasets";

function blobPath(userId: string, blindedId: string): string {
  return `${userId}/${blindedId}`;
}

export async function uploadDatasetBlob(
  supabase: SupabaseClient,
  userId: string,
  blindedId: string,
  bytes: Uint8Array
): Promise<void> {
  const { error } = await supabase.storage
    .from(DATASET_BUCKET)
    .upload(blobPath(userId, blindedId), bytes as BlobPart, {
      contentType: "application/octet-stream",
      // The same dataset re-uploads over itself on every change.
      upsert: true,
    });

  if (error) throw new Error(error.message);
}

/** `null` when the object is absent, which is not an error: a record can arrive
 *  from another device fractionally before the blob it points at finishes
 *  uploading, and the next sync picks it up. */
export async function downloadDatasetBlob(
  supabase: SupabaseClient,
  userId: string,
  blindedId: string
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage
    .from(DATASET_BUCKET)
    .download(blobPath(userId, blindedId));

  if (error) return null;
  if (!data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeDatasetBlob(
  supabase: SupabaseClient,
  userId: string,
  blindedId: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(DATASET_BUCKET)
    .remove([blobPath(userId, blindedId)]);

  if (error) throw new Error(error.message);
}

/** Empties this account's folder. Used by purge, and only ever able to see one
 *  folder because the bucket's select policy scopes the listing to the caller. */
export async function removeAllDatasetBlobs(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await supabase.storage.from(DATASET_BUCKET).list(userId);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return;

  const paths = data.map((entry) => blobPath(userId, entry.name));
  const removed = await supabase.storage.from(DATASET_BUCKET).remove(paths);
  if (removed.error) throw new Error(removed.error.message);
}
