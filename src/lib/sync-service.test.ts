import { describe, it, expect } from "vitest";
import { runSync, hashRecordContent, type SyncTransport, type TransportRecord } from "./sync-service";
import { generateDataKey, type Sealed } from "./crypto";
import type { SyncRecord } from "./sync-payload";

/** An in-memory server that behaves like the migration: it assigns revisions,
 *  and it only ever sees blinded ids and sealed blobs. */
function fakeServer() {
  const rows = new Map<string, TransportRecord & { sealed: Sealed | null }>();
  const writes: { id: string; sealed: Sealed; contentUpdatedAt: number }[] = [];

  const transport: SyncTransport = {
    async list() {
      return [...rows.values()].map(({ id, revision, contentUpdatedAt, deleted }) => ({
        id,
        revision,
        contentUpdatedAt,
        deleted,
      }));
    },
    async get(id) {
      return rows.get(id)?.sealed ?? null;
    },
    async put(id, sealed, contentUpdatedAt) {
      writes.push({ id, sealed, contentUpdatedAt });
      const previous = rows.get(id);
      rows.set(id, {
        id,
        revision: (previous?.revision ?? 0) + 1,
        contentUpdatedAt,
        deleted: false,
        sealed,
      });
    },
    async remove(id, contentUpdatedAt) {
      const previous = rows.get(id);
      rows.set(id, {
        id,
        revision: (previous?.revision ?? 0) + 1,
        contentUpdatedAt,
        deleted: true,
        sealed: null,
      });
    },
  };

  return { transport, rows, writes };
}

const recipeRecord: SyncRecord = {
  logicalId: "recipe:order date=date|region=category|revenue=number",
  kind: "recipe",
  payload: {
    schema: "order date=date|region=category|revenue=number",
    sourceName: "Sales September",
    ops: [{ kind: "mergeValues", column: "region", mapping: { EMEAA: "EMEA" } }],
    updatedAt: 1_000,
  },
  updatedAt: 1_000,
};

const NOW = 5_000;

describe("runSync on a first run", () => {
  it("pushes everything and returns bookmarks to persist", async () => {
    const { transport, rows } = fakeServer();
    const outcome = await runSync({
      transport,
      dataKey: await generateDataKey(),
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });

    expect(outcome.pushed).toEqual([recipeRecord.logicalId]);
    expect(outcome.pulled).toEqual([]);
    expect(rows.size).toBe(1);
    expect(outcome.bookmarks).toHaveLength(1);
    expect(outcome.bookmarks[0].baseRevision).toBe(1);
  });

  /* The claim the whole feature rests on. The transport is the only thing that
   * touches a network, and it must never be handed a readable payload. */
  it("hands the transport ciphertext and nothing else", async () => {
    const { transport, writes } = fakeServer();
    await runSync({
      transport,
      dataKey: await generateDataKey(),
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });

    const serialized = JSON.stringify(writes);
    expect(serialized).not.toContain("Sales September");
    expect(serialized).not.toContain("region");
    expect(serialized).not.toContain("EMEA");
    expect(serialized).not.toContain("mergeValues");
    expect(writes[0].sealed.ciphertext.length).toBeGreaterThan(0);
  });

  it("never lets a logical id reach the server", async () => {
    const { transport, writes, rows } = fakeServer();
    await runSync({
      transport,
      dataKey: await generateDataKey(),
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });

    for (const id of rows.keys()) {
      expect(id).not.toContain("recipe");
      expect(id).not.toContain("revenue");
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(writes[0].id).not.toBe(recipeRecord.logicalId);
  });
});

describe("runSync is idempotent", () => {
  it("pushes nothing on a second run over unchanged state", async () => {
    const { transport } = fakeServer();
    const dataKey = await generateDataKey();

    const first = await runSync({
      transport,
      dataKey,
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });
    const second = await runSync({
      transport,
      dataKey,
      records: [recipeRecord],
      bookmarks: first.bookmarks,
      now: NOW,
    });

    expect(second.pushed).toEqual([]);
    expect(second.pulled).toEqual([]);
    expect(second.unchanged).toEqual([recipeRecord.logicalId]);
  });

  it("pushes again once the payload actually changes", async () => {
    const { transport } = fakeServer();
    const dataKey = await generateDataKey();

    const first = await runSync({
      transport,
      dataKey,
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });

    const edited: SyncRecord = {
      ...recipeRecord,
      payload: { ...(recipeRecord.payload as object), sourceName: "Sales October" },
      updatedAt: 9_000,
    };
    const second = await runSync({
      transport,
      dataKey,
      records: [edited],
      bookmarks: first.bookmarks,
      now: NOW,
    });

    expect(second.pushed).toEqual([recipeRecord.logicalId]);
    expect(second.bookmarks[0].baseRevision).toBe(2);
  });

  it("does not push when only the timestamp moved", async () => {
    const { transport } = fakeServer();
    const dataKey = await generateDataKey();

    const first = await runSync({
      transport,
      dataKey,
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });
    const restamped: SyncRecord = { ...recipeRecord, updatedAt: 88_000 };
    const second = await runSync({
      transport,
      dataKey,
      records: [restamped],
      bookmarks: first.bookmarks,
      now: NOW,
    });

    expect(second.pushed).toEqual([]);
  });
});

describe("runSync between two devices", () => {
  it("carries a record from one device to another", async () => {
    const { transport } = fakeServer();
    const dataKey = await generateDataKey();

    await runSync({ transport, dataKey, records: [recipeRecord], bookmarks: [], now: NOW });

    // Device two: same account key, empty workspace.
    const second = await runSync({ transport, dataKey, records: [], bookmarks: [], now: NOW });

    expect(second.pulled).toHaveLength(1);
    expect(second.pulled[0].logicalId).toBe(recipeRecord.logicalId);
    expect(second.pulled[0].payload).toEqual(recipeRecord.payload);
    expect(second.pulled[0].kind).toBe("recipe");
  });

  it("settles after the pulled record is adopted", async () => {
    const { transport } = fakeServer();
    const dataKey = await generateDataKey();

    await runSync({ transport, dataKey, records: [recipeRecord], bookmarks: [], now: NOW });
    const pull = await runSync({ transport, dataKey, records: [], bookmarks: [], now: NOW });

    // The device adopts what it pulled, then syncs again.
    const settled = await runSync({
      transport,
      dataKey,
      records: [recipeRecord],
      bookmarks: pull.bookmarks,
      now: NOW,
    });

    expect(settled.pushed).toEqual([]);
    expect(settled.pulled).toEqual([]);
    expect(settled.unchanged).toEqual([recipeRecord.logicalId]);
  });
});

describe("runSync refuses what it cannot trust", () => {
  it("rejects a row written under a different account key", async () => {
    const { transport } = fakeServer();
    await runSync({
      transport,
      dataKey: await generateDataKey(),
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });

    // A different key cannot even address the row, so nothing is pulled and
    // nothing is misapplied.
    const stranger = await runSync({
      transport,
      dataKey: await generateDataKey(),
      records: [],
      bookmarks: [],
      now: NOW,
    });

    expect(stranger.pulled).toEqual([]);
    expect(stranger.rejected).toHaveLength(1);
    expect(stranger.rejected[0].reason).toMatch(/could not be decrypted/i);
  });

  it("rejects a record kind it does not recognize instead of applying it", async () => {
    const { transport, rows } = fakeServer();
    const dataKey = await generateDataKey();
    const { seal, blindId } = await import("./crypto");

    const blinded = await blindId(dataKey, "future:thing");
    rows.set(blinded, {
      id: blinded,
      revision: 1,
      contentUpdatedAt: 1_000,
      deleted: false,
      sealed: await seal(dataKey, {
        kind: "quantumDashboard",
        logicalId: "future:thing",
        payload: {},
        updatedAt: 1_000,
      }),
    });

    const outcome = await runSync({ transport, dataKey, records: [], bookmarks: [], now: NOW });
    expect(outcome.pulled).toEqual([]);
    expect(outcome.rejected[0].reason).toMatch(/unknown record kind/i);
  });

  it("reports a listed row the server cannot actually produce", async () => {
    const { transport, rows } = fakeServer();
    const dataKey = await generateDataKey();
    rows.set("phantom", {
      id: "phantom",
      revision: 1,
      contentUpdatedAt: 1_000,
      deleted: false,
      sealed: null,
    });

    const outcome = await runSync({ transport, dataKey, records: [], bookmarks: [], now: NOW });
    expect(outcome.rejected[0].reason).toMatch(/did not have/i);
  });
});

describe("runSync deletions", () => {
  it("tombstones on the server and drops the bookmark", async () => {
    const { transport } = fakeServer();
    const dataKey = await generateDataKey();

    const first = await runSync({
      transport,
      dataKey,
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });

    const deleted = await runSync({
      transport,
      dataKey,
      records: [],
      bookmarks: first.bookmarks,
      tombstones: [recipeRecord.logicalId],
      now: NOW,
    });

    expect(deleted.deletedRemotely).toEqual([recipeRecord.logicalId]);
    expect(deleted.bookmarks).toEqual([]);
  });

  it("does not re-pull a record deleted from another device", async () => {
    const { transport } = fakeServer();
    const dataKey = await generateDataKey();

    const first = await runSync({
      transport,
      dataKey,
      records: [recipeRecord],
      bookmarks: [],
      now: NOW,
    });
    await runSync({
      transport,
      dataKey,
      records: [],
      bookmarks: first.bookmarks,
      tombstones: [recipeRecord.logicalId],
      now: NOW,
    });

    const other = await runSync({ transport, dataKey, records: [], bookmarks: [], now: NOW });
    expect(other.pulled).toEqual([]);
    expect(other.rejected).toEqual([]);
  });
});

describe("hashRecordContent", () => {
  it("is stable for equal content and different for changed content", async () => {
    const a = await hashRecordContent("recipe", { x: 1 });
    const b = await hashRecordContent("recipe", { x: 1 });
    const c = await hashRecordContent("recipe", { x: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("separates the same payload under different kinds", async () => {
    expect(await hashRecordContent("recipe", { x: 1 })).not.toBe(
      await hashRecordContent("roster", { x: 1 })
    );
  });
});
