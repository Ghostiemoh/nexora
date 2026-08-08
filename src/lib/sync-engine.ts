/* What to push, what to pull, and who wins when both sides moved.
 *
 * Pure. No network, no crypto, no store. It reads two lists of record states and
 * returns a plan, which is what makes the interesting parts testable without
 * standing up a server.
 *
 * The engine compares revisions rather than clocks. Wall-clock last-write-wins
 * loses edits for a boring reason: a laptop running four minutes fast wins every
 * race it should have lost. The server owns a monotonic revision per record and
 * the local copy remembers which revision it last reconciled against, so "has
 * anyone else changed this since I last looked" is answerable without trusting
 * anybody's clock. Timestamps come in only to break a genuine conflict, where
 * something has to give and the alternative is asking the reader about a
 * dashboard layout. */

export interface LocalRecord {
  id: string;
  /** the remote revision this copy was last reconciled against, 0 if never */
  baseRevision: number;
  /** changed on this device since that reconciliation */
  dirty: boolean;
  /** locally tombstoned, awaiting propagation */
  deleted?: boolean;
  /** local modification time, used only to break a genuine conflict */
  updatedAt: number;
}

export interface RemoteRecord {
  id: string;
  /** monotonic, assigned by the server on every write */
  revision: number;
  deleted?: boolean;
  updatedAt: number;
}

export type Resolution = "local" | "remote";

export interface Conflict {
  id: string;
  winner: Resolution;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
}

export interface SyncPlan {
  /** send the local copy up */
  push: string[];
  /** take the remote copy down */
  pull: string[];
  /** tombstone locally */
  deleteLocal: string[];
  /** tombstone on the server */
  deleteRemote: string[];
  unchanged: string[];
  /** both sides moved; the plan already reflects the resolution */
  conflicts: Conflict[];
}

/** Later edit wins. A tie goes to the server, because that is the copy every
 *  device can already see, and because a tie broken differently on two devices
 *  leaves them pushing at each other forever. */
function resolve(localAt: number, remoteAt: number): Resolution {
  return localAt > remoteAt ? "local" : "remote";
}

export function planSync(local: LocalRecord[], remote: RemoteRecord[]): SyncPlan {
  const plan: SyncPlan = {
    push: [],
    pull: [],
    deleteLocal: [],
    deleteRemote: [],
    unchanged: [],
    conflicts: [],
  };

  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const seen = new Set<string>();

  for (const mine of local) {
    seen.add(mine.id);
    const theirs = remoteById.get(mine.id);

    if (!theirs) {
      // Never uploaded. A local tombstone for a record the server does not have
      // is already satisfied, so it needs nothing.
      if (mine.dirty && !mine.deleted) plan.push.push(mine.id);
      else if (!mine.deleted) plan.push.push(mine.id);
      else plan.unchanged.push(mine.id);
      continue;
    }

    /* A baseRevision ahead of the server means the local bookkeeping is corrupt,
     * most likely a restored backup or a wiped server row. Trusting the number
     * would silently skip the record forever, so treat it as unreconciled. */
    const untouchedSinceSync = theirs.revision <= mine.baseRevision;

    if (!mine.dirty) {
      if (untouchedSinceSync) {
        plan.unchanged.push(mine.id);
      } else if (theirs.deleted) {
        plan.deleteLocal.push(mine.id);
      } else {
        plan.pull.push(mine.id);
      }
      continue;
    }

    // Dirty locally.
    if (untouchedSinceSync) {
      if (mine.deleted) plan.deleteRemote.push(mine.id);
      else plan.push.push(mine.id);
      continue;
    }

    // Dirty locally *and* moved remotely: a genuine conflict.
    const winner = resolve(mine.updatedAt, theirs.updatedAt);
    plan.conflicts.push({
      id: mine.id,
      winner,
      localUpdatedAt: mine.updatedAt,
      remoteUpdatedAt: theirs.updatedAt,
    });

    if (winner === "local") {
      if (mine.deleted) plan.deleteRemote.push(mine.id);
      else plan.push.push(mine.id);
    } else if (theirs.deleted) {
      plan.deleteLocal.push(mine.id);
    } else {
      plan.pull.push(mine.id);
    }
  }

  for (const theirs of remote) {
    if (seen.has(theirs.id)) continue;
    // A tombstone for a record this device never held is nothing to do, not a
    // delete to apply.
    if (!theirs.deleted) plan.pull.push(theirs.id);
  }

  return plan;
}
