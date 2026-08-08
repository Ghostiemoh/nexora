/* The migration, executed against real Postgres.
 *
 * `supabase-live.test.ts` needs a hosted project and stays skipped without
 * credentials, which left the riskiest file in the sync feature verified only by
 * reading it. Most of that risk is not Supabase-specific though: whether the DDL
 * is valid, whether the revision trigger fires and bumps, whether the size
 * constraint holds, and whether the policy predicates actually isolate one
 * account from another are all plain Postgres questions. PGlite answers them
 * offline, in this case on PostgreSQL 18.
 *
 * What is stubbed, and therefore what this does NOT prove: `auth.users` and
 * `auth.uid()` are Supabase's, so they are replaced here by a table and a
 * function reading a test setting. The policy logic is exercised for real; the
 * wiring from a JWT to `auth.uid()` is not. That part still needs the live test.
 *
 * RLS is also bypassed by superusers and by a table's owner, and PGlite connects
 * as `postgres`, so every query below runs after SET ROLE to a non-superuser,
 * exactly as Supabase's `authenticated` role would. */

import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0001_sync.sql"),
  "utf8"
);

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

/** Stand in for the parts of Supabase the migration leans on. */
const SUPABASE_STUB = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  do $$ begin
    create role authenticated;
  exception when duplicate_object then null;
  end $$;
`;

const GRANTS = `
  grant usage on schema public to authenticated;
  grant select, insert, update, delete on public.sync_records to authenticated;
  grant select, insert, update, delete on public.sync_vault to authenticated;
`;

async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  await db.exec(MIGRATION);
  await db.exec(GRANTS);
  await db.exec(`
    insert into auth.users (id) values ('${ALICE}'), ('${BOB}');
  `);
  return db;
}

/** Run subsequent queries as a signed-in, non-superuser account. */
async function actAs(db: PGlite, uid: string): Promise<void> {
  await db.exec("reset role;");
  await db.query("select set_config('test.uid', $1, false)", [uid]);
  await db.exec("set role authenticated;");
}

async function insertRecord(
  db: PGlite,
  uid: string,
  recordId: string,
  contentUpdatedAt = 1_000
) {
  return db.query(
    `insert into public.sync_records
       (user_id, record_id, iv, ciphertext, content_updated_at)
     values ($1, $2, 'iv', 'ciphertext', $3)`,
    [uid, recordId, contentUpdatedAt]
  );
}

describe("the migration applies", () => {
  it("runs against a clean database without error", async () => {
    await expect(freshDb()).resolves.toBeDefined();
  });

  /* Postgres has no CREATE POLICY IF NOT EXISTS, even in 18, so without the
   * explicit drops a retried `supabase db push` fails on the second attempt. */
  it("runs a second time, so a retried push is not a dead end", async () => {
    const db = await freshDb();
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  it("creates both tables with row level security enabled", async () => {
    const db = await freshDb();
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('sync_records','sync_vault') order by relname`
    );
    expect(result.rows).toEqual([
      { relname: "sync_records", relrowsecurity: true },
      { relname: "sync_vault", relrowsecurity: true },
    ]);
  });

  it("installs a policy for every operation on both tables", async () => {
    const db = await freshDb();
    const result = await db.query<{ tablename: string; count: number }>(
      `select tablename, count(*)::int as count from pg_policies
       where schemaname = 'public' group by tablename order by tablename`
    );
    expect(result.rows).toEqual([
      { tablename: "sync_records", count: 4 },
      { tablename: "sync_vault", count: 4 },
    ]);
  });
});

describe("the revision trigger", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("assigns 1 on insert, whatever the client asks for", async () => {
    await actAs(db, ALICE);
    // A client claiming to be at revision 99 is ignored: the database owns it.
    await db.query(
      `insert into public.sync_records
         (user_id, record_id, revision, iv, ciphertext, content_updated_at)
       values ($1, 'r1', 99, 'iv', 'c', 1000)`,
      [ALICE]
    );

    const { rows } = await db.query<{ revision: number }>(
      "select revision from public.sync_records where record_id = 'r1'"
    );
    expect(Number(rows[0].revision)).toBe(1);
  });

  it("bumps on every update, which is what the sync engine compares", async () => {
    await actAs(db, ALICE);
    await insertRecord(db, ALICE, "r2");

    for (const expected of [2, 3, 4]) {
      await db.query(
        "update public.sync_records set ciphertext = 'next' where record_id = 'r2'"
      );
      const { rows } = await db.query<{ revision: number }>(
        "select revision from public.sync_records where record_id = 'r2'"
      );
      expect(Number(rows[0].revision)).toBe(expected);
    }
  });

  it("keeps the client's content stamp separate from the server clock", async () => {
    await actAs(db, ALICE);
    await insertRecord(db, ALICE, "r3", 1_700_000_000_000);

    const { rows } = await db.query<{ content_updated_at: string; updated_at: Date }>(
      "select content_updated_at, updated_at from public.sync_records where record_id = 'r3'"
    );
    // The device's own epoch ms survives untouched; the server stamps its own.
    expect(Number(rows[0].content_updated_at)).toBe(1_700_000_000_000);
    expect(rows[0].updated_at).toBeInstanceOf(Date);
  });

  it("bumps the revision on a tombstone, so other devices notice the delete", async () => {
    await actAs(db, ALICE);
    await insertRecord(db, ALICE, "r4");
    await db.query(
      `update public.sync_records
         set deleted = true, iv = '', ciphertext = '' where record_id = 'r4'`
    );

    const { rows } = await db.query<{ revision: number; deleted: boolean }>(
      "select revision, deleted from public.sync_records where record_id = 'r4'"
    );
    expect(rows[0].deleted).toBe(true);
    expect(Number(rows[0].revision)).toBe(2);
  });
});

describe("the size ceiling", () => {
  it("accepts a payload at the limit and rejects one over it", async () => {
    const db = await freshDb();
    await actAs(db, ALICE);

    const atLimit = "x".repeat(1_048_576);
    await expect(
      db.query(
        `insert into public.sync_records (user_id, record_id, iv, ciphertext, content_updated_at)
         values ($1, 'big-ok', 'iv', $2, 1000)`,
        [ALICE, atLimit]
      )
    ).resolves.toBeDefined();

    await expect(
      db.query(
        `insert into public.sync_records (user_id, record_id, iv, ciphertext, content_updated_at)
         values ($1, 'too-big', 'iv', $2, 1000)`,
        [ALICE, `${atLimit}x`]
      )
    ).rejects.toThrow();
  });
});

describe("row level security", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
    await actAs(db, ALICE);
    await insertRecord(db, ALICE, "alice-private");
    await db.query(
      `insert into public.sync_vault (user_id, wrapped_keys) values ($1, '{"secret":true}'::jsonb)`,
      [ALICE]
    );
  });

  it("shows an account its own rows", async () => {
    await actAs(db, ALICE);
    const { rows } = await db.query("select record_id from public.sync_records");
    expect(rows).toEqual([{ record_id: "alice-private" }]);
  });

  /* The claim the whole feature rests on: isolation is enforced by the database,
   * not by the application remembering to filter. */
  it("hides them from another account entirely", async () => {
    await actAs(db, BOB);
    const { rows } = await db.query("select record_id from public.sync_records");
    expect(rows).toEqual([]);
  });

  it("hides them even when the query names the owner explicitly", async () => {
    await actAs(db, BOB);
    const { rows } = await db.query(
      "select record_id from public.sync_records where user_id = $1",
      [ALICE]
    );
    expect(rows).toEqual([]);
  });

  it("refuses a row forged under another account's id", async () => {
    await actAs(db, BOB);
    await expect(insertRecord(db, ALICE, "forged")).rejects.toThrow(/row-level security/i);
  });

  it("refuses to reassign one of your own rows to someone else", async () => {
    await actAs(db, BOB);
    await insertRecord(db, BOB, "bobs-own");
    await expect(
      db.query("update public.sync_records set user_id = $1 where record_id = 'bobs-own'", [
        ALICE,
      ])
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot delete another account's rows", async () => {
    await actAs(db, BOB);
    await db.query("delete from public.sync_records where record_id = 'alice-private'");

    await actAs(db, ALICE);
    const { rows } = await db.query(
      "select record_id from public.sync_records where record_id = 'alice-private'"
    );
    expect(rows).toHaveLength(1);
  });

  it("isolates the vault the same way", async () => {
    await actAs(db, BOB);
    const { rows } = await db.query("select user_id from public.sync_vault");
    expect(rows).toEqual([]);

    await actAs(db, ALICE);
    const mine = await db.query("select user_id from public.sync_vault");
    expect(mine.rows).toEqual([{ user_id: ALICE }]);
  });

  it("hides everything from a session with no account at all", async () => {
    await db.exec("reset role;");
    await db.query("select set_config('test.uid', '', false)");
    await db.exec("set role authenticated;");

    const { rows } = await db.query("select record_id from public.sync_records");
    expect(rows).toEqual([]);
  });
});

describe("account deletion", () => {
  it("takes the records and the vault with it", async () => {
    const db = await freshDb();
    await actAs(db, ALICE);
    await insertRecord(db, ALICE, "cascade-me");
    await db.query(
      `insert into public.sync_vault (user_id, wrapped_keys) values ($1, '{}'::jsonb)`,
      [ALICE]
    );

    // Deleting the user is an admin action, so it runs as the owner.
    await db.exec("reset role;");
    await db.query("delete from auth.users where id = $1", [ALICE]);

    const records = await db.query("select record_id from public.sync_records");
    const vault = await db.query("select user_id from public.sync_vault");
    expect(records.rows).toEqual([]);
    expect(vault.rows).toEqual([]);
  });
});
