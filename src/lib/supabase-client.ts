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
  const records = await supabase.from("sync_records").delete().eq("user_id", userId);
  if (records.error) throw new Error(records.error.message);

  const vault = await supabase.from("sync_vault").delete().eq("user_id", userId);
  if (vault.error) throw new Error(vault.error.message);
}
