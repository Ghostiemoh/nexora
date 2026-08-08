import { describe, it, expect } from "vitest";
import { planSync, type LocalRecord, type RemoteRecord } from "./sync-engine";

function local(
  id: string,
  overrides: Partial<LocalRecord> = {}
): LocalRecord {
  return { id, baseRevision: 0, dirty: false, updatedAt: 1_000, ...overrides };
}

function remote(id: string, overrides: Partial<RemoteRecord> = {}): RemoteRecord {
  return { id, revision: 1, updatedAt: 1_000, ...overrides };
}

describe("planSync, the simple cases", () => {
  it("pushes a record the server has never seen", () => {
    const plan = planSync([local("a", { dirty: true })], []);
    expect(plan.push).toEqual(["a"]);
    expect(plan.pull).toEqual([]);
  });

  it("pulls a record this device has never seen", () => {
    const plan = planSync([], [remote("a")]);
    expect(plan.pull).toEqual(["a"]);
    expect(plan.push).toEqual([]);
  });

  it("leaves a reconciled record alone", () => {
    const plan = planSync([local("a", { baseRevision: 1 })], [remote("a", { revision: 1 })]);
    expect(plan.unchanged).toEqual(["a"]);
    expect(plan.push).toEqual([]);
    expect(plan.pull).toEqual([]);
  });

  it("does nothing at all when both sides are empty", () => {
    const plan = planSync([], []);
    expect(plan).toEqual({
      push: [],
      pull: [],
      deleteLocal: [],
      deleteRemote: [],
      unchanged: [],
      conflicts: [],
    });
  });
});

describe("planSync uses revisions, not the wall clock", () => {
  /* Comparing two machines' clocks is the classic way to lose an edit: a device
   * running four minutes fast wins every race it should lose. The server owns a
   * monotonic revision per record, and the local copy remembers which revision
   * it last reconciled against, so "did anyone else change this" is answerable
   * without trusting any clock. */
  it("pushes a local edit when nobody else has touched the record", () => {
    const plan = planSync(
      [local("a", { baseRevision: 4, dirty: true, updatedAt: 500 })],
      [remote("a", { revision: 4, updatedAt: 999_999 })]
    );
    // The remote timestamp is far ahead, and it does not matter.
    expect(plan.push).toEqual(["a"]);
    expect(plan.conflicts).toEqual([]);
  });

  it("pulls when the server has moved on and this device has no local edit", () => {
    const plan = planSync(
      [local("a", { baseRevision: 4, updatedAt: 999_999 })],
      [remote("a", { revision: 7, updatedAt: 500 })]
    );
    expect(plan.pull).toEqual(["a"]);
    expect(plan.push).toEqual([]);
  });

  it("treats a local edit against a moved-on server as a real conflict", () => {
    const plan = planSync(
      [local("a", { baseRevision: 4, dirty: true, updatedAt: 2_000 })],
      [remote("a", { revision: 7, updatedAt: 1_000 })]
    );
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].id).toBe("a");
  });
});

describe("planSync conflict resolution", () => {
  it("gives a genuine conflict to whichever side was edited later", () => {
    const localWins = planSync(
      [local("a", { baseRevision: 1, dirty: true, updatedAt: 5_000 })],
      [remote("a", { revision: 2, updatedAt: 4_000 })]
    );
    expect(localWins.conflicts[0].winner).toBe("local");
    expect(localWins.push).toEqual(["a"]);
    expect(localWins.pull).toEqual([]);

    const remoteWins = planSync(
      [local("a", { baseRevision: 1, dirty: true, updatedAt: 3_000 })],
      [remote("a", { revision: 2, updatedAt: 4_000 })]
    );
    expect(remoteWins.conflicts[0].winner).toBe("remote");
    expect(remoteWins.pull).toEqual(["a"]);
    expect(remoteWins.push).toEqual([]);
  });

  /* A tie has to break the same way on every device or the two of them push at
   * each other forever. The server copy wins, because it is the one both
   * devices can already see. */
  it("breaks a timestamp tie toward the server so the devices converge", () => {
    const plan = planSync(
      [local("a", { baseRevision: 1, dirty: true, updatedAt: 4_000 })],
      [remote("a", { revision: 2, updatedAt: 4_000 })]
    );
    expect(plan.conflicts[0].winner).toBe("remote");
    expect(plan.pull).toEqual(["a"]);
  });

  it("reports both timestamps so the UI can say what it chose", () => {
    const plan = planSync(
      [local("a", { baseRevision: 1, dirty: true, updatedAt: 5_000 })],
      [remote("a", { revision: 2, updatedAt: 4_000 })]
    );
    expect(plan.conflicts[0]).toEqual({
      id: "a",
      winner: "local",
      localUpdatedAt: 5_000,
      remoteUpdatedAt: 4_000,
    });
  });
});

describe("planSync deletions", () => {
  it("propagates a local delete to the server", () => {
    const plan = planSync(
      [local("a", { baseRevision: 1, dirty: true, deleted: true })],
      [remote("a", { revision: 1 })]
    );
    expect(plan.deleteRemote).toEqual(["a"]);
    expect(plan.push).toEqual([]);
  });

  it("propagates a server delete to this device", () => {
    const plan = planSync(
      [local("a", { baseRevision: 1 })],
      [remote("a", { revision: 2, deleted: true })]
    );
    expect(plan.deleteLocal).toEqual(["a"]);
    expect(plan.pull).toEqual([]);
  });

  it("does not resurrect a record both sides already deleted", () => {
    const plan = planSync(
      [local("a", { baseRevision: 2, deleted: true })],
      [remote("a", { revision: 2, deleted: true })]
    );
    expect(plan.unchanged).toEqual(["a"]);
    expect(plan.pull).toEqual([]);
    expect(plan.deleteLocal).toEqual([]);
  });

  it("does not pull a tombstone for a record this device never had", () => {
    const plan = planSync([], [remote("a", { revision: 3, deleted: true })]);
    expect(plan.pull).toEqual([]);
    expect(plan.deleteLocal).toEqual([]);
  });

  /* A delete losing to a live edit is the safe direction: the record comes
   * back and the reader can delete it again, which is recoverable. The other
   * way round destroys work. */
  it("lets a later edit win over an earlier delete", () => {
    const plan = planSync(
      [local("a", { baseRevision: 1, dirty: true, updatedAt: 9_000 })],
      [remote("a", { revision: 2, deleted: true, updatedAt: 1_000 })]
    );
    expect(plan.push).toEqual(["a"]);
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.conflicts[0].winner).toBe("local");
  });

  it("lets a later delete win over an earlier edit", () => {
    const plan = planSync(
      [local("a", { baseRevision: 1, dirty: true, updatedAt: 1_000 })],
      [remote("a", { revision: 2, deleted: true, updatedAt: 9_000 })]
    );
    expect(plan.deleteLocal).toEqual(["a"]);
    expect(plan.push).toEqual([]);
  });
});

describe("planSync at scale and in odd orders", () => {
  it("handles a mixed batch without dropping anything", () => {
    const plan = planSync(
      [
        local("push-me", { dirty: true }),
        local("keep", { baseRevision: 3 }),
        local("stale", { baseRevision: 1 }),
        local("gone", { baseRevision: 1, dirty: true, deleted: true }),
      ],
      [
        remote("keep", { revision: 3 }),
        remote("stale", { revision: 5 }),
        remote("gone", { revision: 1 }),
        remote("fetch-me", { revision: 1 }),
      ]
    );

    expect(plan.push).toEqual(["push-me"]);
    expect(plan.pull).toEqual(["stale", "fetch-me"]);
    expect(plan.deleteRemote).toEqual(["gone"]);
    expect(plan.unchanged).toEqual(["keep"]);

    // Every id lands in exactly one bucket.
    const all = [
      ...plan.push,
      ...plan.pull,
      ...plan.deleteLocal,
      ...plan.deleteRemote,
      ...plan.unchanged,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(["fetch-me", "gone", "keep", "push-me", "stale"]);
  });

  it("does not depend on the order the records arrive in", () => {
    const l = [local("a", { dirty: true }), local("b", { baseRevision: 1 })];
    const r = [remote("b", { revision: 2 }), remote("c")];

    const forward = planSync(l, r);
    const backward = planSync([...l].reverse(), [...r].reverse());

    expect(new Set(forward.push)).toEqual(new Set(backward.push));
    expect(new Set(forward.pull)).toEqual(new Set(backward.pull));
  });

  it("is idempotent: replanning after a clean sync asks for nothing", () => {
    const plan = planSync(
      [local("a", { baseRevision: 9 }), local("b", { baseRevision: 4 })],
      [remote("a", { revision: 9 }), remote("b", { revision: 4 })]
    );
    expect(plan.push).toEqual([]);
    expect(plan.pull).toEqual([]);
    expect(plan.unchanged).toHaveLength(2);
  });

  /* A local record marked dirty with a baseRevision ahead of the server means
   * the local bookkeeping is corrupt, most likely a restored backup. Pushing is
   * the recoverable choice; trusting the number is not. */
  it("pushes rather than trusts a local baseRevision ahead of the server", () => {
    const plan = planSync(
      [local("a", { baseRevision: 12, dirty: true })],
      [remote("a", { revision: 3 })]
    );
    expect(plan.push).toEqual(["a"]);
  });
});
