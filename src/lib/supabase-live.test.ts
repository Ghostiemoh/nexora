/* The test the unit suite cannot be: a real round trip against a real Supabase
 * project.
 *
 * Everything else in this repo tests the parts that can be reasoned about in
 * isolation. What none of it can prove is that the migration applied, that row
 * level security actually isolates a user, or that the revision trigger fires,
 * because all three live in Postgres rather than in TypeScript.
 *
 * Skipped unless credentials are present, so `npm test` stays offline and
 * deterministic. To run it:
 *
 *   1. Apply supabase/migrations/0001_sync.sql to a throwaway project.
 *   2. Turn OFF "Confirm email" in Auth settings, or the sign-ups here cannot
 *      get a session.
 *   3. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then:
 *        npx vitest run src/lib/supabase-live.test.ts
 *
 * It creates two throwaway accounts on a domain reserved for testing and leaves
 * them behind; the anon key cannot delete users. Point it at a project you are
 * willing to litter. */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateDataKey, seal, unseal, blindId } from "./crypto";
import { createSupabaseTransport, loadKeyRing, saveKeyRing, purgeRemoteWorkspace } from "./supabase-client";
import { emptyKeyRing, wrapDataKey, deriveSecrets } from "./crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const live = Boolean(URL && ANON);

/** `example.com` is reserved by RFC 2606, so these addresses can never collide
 *  with a real inbox. */
function throwawayEmail(): string {
  return `nexora-live-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function freshAccount(): Promise<{ client: SupabaseClient; userId: string; email: string }> {
  const client = createClient(URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const email = throwawayEmail();
  const { data, error } = await client.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` });

  if (error) throw new Error(`sign-up failed: ${error.message}`);
  if (!data.session) {
    throw new Error(
      "Sign-up returned no session. Turn off 'Confirm email' in the project's Auth settings to run this test."
    );
  }
  return { client, userId: data.user!.id, email };
}

describe.skipIf(!live)("Supabase, live", () => {
  let alice: Awaited<ReturnType<typeof freshAccount>>;

  beforeAll(async () => {
    alice = await freshAccount();
  }, 30_000);

  it("stores and returns a sealed record", async () => {
    const dataKey = await generateDataKey();
    const transport = createSupabaseTransport(alice.client, alice.userId);

    const id = await blindId(dataKey, "recipe:live-test");
    const sealed = await seal(dataKey, { ops: [{ kind: "trimWhitespace" }] });
    await transport.put(id, sealed, 1_000);

    const back = await transport.get(id);
    expect(back).not.toBeNull();
    expect(await unseal(dataKey, back!)).toEqual({ ops: [{ kind: "trimWhitespace" }] });
  });

  /* The trigger, not the client, owns this number. If it did not fire, the sync
   * engine's whole "has anyone else changed this" question is unanswerable. */
  it("has the database assign and bump the revision", async () => {
    const dataKey = await generateDataKey();
    const transport = createSupabaseTransport(alice.client, alice.userId);
    const id = await blindId(dataKey, "recipe:revision-test");

    await transport.put(id, await seal(dataKey, { v: 1 }), 1_000);
    const first = (await transport.list()).find((r) => r.id === id);
    expect(first?.revision).toBe(1);

    await transport.put(id, await seal(dataKey, { v: 2 }), 2_000);
    const second = (await transport.list()).find((r) => r.id === id);
    expect(second?.revision).toBe(2);
    expect(second?.contentUpdatedAt).toBe(2_000);
  });

  it("tombstones rather than hard-deletes, so other devices learn about it", async () => {
    const dataKey = await generateDataKey();
    const transport = createSupabaseTransport(alice.client, alice.userId);
    const id = await blindId(dataKey, "recipe:tombstone-test");

    await transport.put(id, await seal(dataKey, { v: 1 }), 1_000);
    await transport.remove(id, 2_000);

    const row = (await transport.list()).find((r) => r.id === id);
    expect(row?.deleted).toBe(true);
    expect(await transport.get(id)).toBeNull();
  });

  it("round-trips a key ring through the vault", async () => {
    const dataKey = await generateDataKey();
    const { wrappingKey } = await deriveSecrets("a passphrase", alice.email);
    const ring = { ...emptyKeyRing(), passphrase: await wrapDataKey(dataKey, wrappingKey) };

    await saveKeyRing(alice.client, alice.userId, ring);
    const back = await loadKeyRing(alice.client, alice.userId);
    expect(back?.passphrase?.wrapped).toBe(ring.passphrase!.wrapped);
  });

  /* The claim that row level security, rather than application code, is what
   * isolates accounts. If this fails, everything else is decoration. */
  it("hides one account's rows from another completely", async () => {
    const bob = await freshAccount();
    const dataKey = await generateDataKey();

    const aliceTransport = createSupabaseTransport(alice.client, alice.userId);
    const id = await blindId(dataKey, "recipe:private-to-alice");
    await aliceTransport.put(id, await seal(dataKey, { secret: true }), 1_000);

    // Bob querying his own scope sees nothing of Alice's.
    const bobsOwn = await createSupabaseTransport(bob.client, bob.userId).list();
    expect(bobsOwn.find((r) => r.id === id)).toBeUndefined();

    // Bob naming Alice's user id explicitly still sees nothing: the policy is
    // evaluated against auth.uid(), not against what the query asks for.
    const bobImpersonating = await createSupabaseTransport(bob.client, alice.userId).list();
    expect(bobImpersonating).toEqual([]);

    const { data } = await bob.client.from("sync_vault").select("wrapped_keys").eq("user_id", alice.userId);
    expect(data ?? []).toEqual([]);
  }, 30_000);

  it("refuses a row written under another account's id", async () => {
    const bob = await freshAccount();
    const { error } = await bob.client.from("sync_records").insert({
      user_id: alice.userId,
      record_id: "forged",
      iv: "x",
      ciphertext: "x",
      content_updated_at: 1,
    });
    // The insert policy's WITH CHECK rejects it.
    expect(error).not.toBeNull();
  }, 30_000);

  it("empties the account on request", async () => {
    const dataKey = await generateDataKey();
    const transport = createSupabaseTransport(alice.client, alice.userId);
    await transport.put(await blindId(dataKey, "recipe:purge-me"), await seal(dataKey, {}), 1_000);

    await purgeRemoteWorkspace(alice.client, alice.userId);

    expect(await transport.list()).toEqual([]);
    expect(await loadKeyRing(alice.client, alice.userId)).toBeNull();
  });
});

describe.skipIf(live)("Supabase, live (skipped)", () => {
  it("reports why it did not run", () => {
    expect(live).toBe(false);
    // Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable.
  });
});
