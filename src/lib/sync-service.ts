/* The orchestrator: seal, plan, move, and report.
 *
 * Everything that talks to a network sits behind `SyncTransport`, so the part
 * worth getting right, deciding what moves and making sure nothing leaves
 * unsealed, is testable without a server. The Supabase implementation of the
 * transport is a thin adapter in `supabase-client.ts`.
 *
 * Sealing happens here rather than in the transport on purpose: the transport
 * only ever receives ciphertext, so no future change to it can accidentally
 * send plaintext. */

import { seal, unseal, blindId, toBase64, type Sealed } from "./crypto";
import { planSync, type LocalRecord, type RemoteRecord, type Conflict } from "./sync-engine";
import { isSyncedKind, type SyncRecord, type SyncedKind } from "./sync-payload";

/** What the server stores against a blinded id. The transport never sees a
 *  logical id, a kind, or a plaintext payload. */
export interface TransportRecord {
  id: string;
  revision: number;
  contentUpdatedAt: number;
  deleted: boolean;
}

export interface SyncTransport {
  /** revisions and stamps only, so a sync starts without downloading payloads */
  list(): Promise<TransportRecord[]>;
  get(id: string): Promise<Sealed | null>;
  put(id: string, sealed: Sealed, contentUpdatedAt: number): Promise<void>;
  remove(id: string, contentUpdatedAt: number): Promise<void>;
}

/** Per-record bookkeeping this device keeps between syncs. Persisted locally, it
 *  is what makes the revision comparison possible at all.
 *
 *  `contentHash` is why this works without a dirty flag on the store. Records are
 *  rebuilt from workspace state on every run, so nothing marks them as edited;
 *  comparing the current payload against the hash of the last reconciled one
 *  answers the question directly, and `buildSyncRecords` is deterministic, so an
 *  unchanged workspace hashes identically and pushes nothing. */
export interface SyncBookmark {
  logicalId: string;
  blinded: string;
  baseRevision: number;
  contentHash: string;
}

/** Hash of what a record means, excluding its timestamp: a dataset whose
 *  `updatedAt` moved without its recipe changing is not an edit to sync. */
export async function hashRecordContent(kind: string, payload: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ kind, payload }))
  );
  return toBase64(new Uint8Array(digest));
}

export interface SealedEnvelope {
  kind: SyncedKind;
  logicalId: string;
  payload: unknown;
  updatedAt: number;
}

export interface SyncOutcome {
  pushed: string[];
  pulled: SealedEnvelope[];
  deletedLocally: string[];
  deletedRemotely: string[];
  unchanged: string[];
  conflicts: Conflict[];
  /** refreshed bookmarks, to persist in place of the ones passed in */
  bookmarks: SyncBookmark[];
  /** records the server held that this client could not read or trust */
  rejected: { id: string; reason: string }[];
}

export interface SyncInput {
  transport: SyncTransport;
  dataKey: CryptoKey;
  /** everything this device currently believes is syncable */
  records: readonly SyncRecord[];
  /** bookmarks from the previous sync */
  bookmarks: readonly SyncBookmark[];
  /** logical ids deleted on this device since the last sync */
  tombstones?: readonly string[];
  /** epoch ms to stamp tombstones with; injected so callers stay deterministic */
  now: number;
}

export async function runSync(input: SyncInput): Promise<SyncOutcome> {
  const { transport, dataKey, records, bookmarks, tombstones = [], now } = input;

  const bookmarkByLogical = new Map(bookmarks.map((b) => [b.logicalId, b]));
  /** logical id -> hash of what this device holds now, carried into new bookmarks */
  const hashByLogical = new Map<string, string>();

  /* Blind every id this device knows about, and keep the reverse map: the plan
   * comes back keyed by blinded id, and the caller needs logical ids. */
  const logicalByBlinded = new Map<string, string>();
  const blindedByLogical = new Map<string, string>();

  const known = [...records.map((r) => r.logicalId), ...tombstones];
  await Promise.all(
    known.map(async (logicalId) => {
      const blinded = await blindId(dataKey, logicalId);
      logicalByBlinded.set(blinded, logicalId);
      blindedByLogical.set(logicalId, blinded);
    })
  );

  const remoteRecords = await transport.list();
  const remote: RemoteRecord[] = remoteRecords.map((r) => ({
    id: r.id,
    revision: r.revision,
    deleted: r.deleted,
    updatedAt: r.contentUpdatedAt,
  }));
  const recordByBlinded = new Map<string, SyncRecord>();
  const local: LocalRecord[] = [];

  for (const record of records) {
    const blinded = blindedByLogical.get(record.logicalId)!;
    recordByBlinded.set(blinded, record);

    const bookmark = bookmarkByLogical.get(record.logicalId);
    const hash = await hashRecordContent(record.kind, record.payload);
    hashByLogical.set(record.logicalId, hash);

    local.push({
      id: blinded,
      baseRevision: bookmark?.baseRevision ?? 0,
      // Never synced, or the payload no longer matches what was last reconciled.
      dirty: !bookmark || bookmark.contentHash !== hash,
      updatedAt: record.updatedAt,
    });
  }

  for (const logicalId of tombstones) {
    const blinded = blindedByLogical.get(logicalId)!;
    local.push({
      id: blinded,
      baseRevision: bookmarkByLogical.get(logicalId)?.baseRevision ?? 0,
      dirty: true,
      deleted: true,
      updatedAt: now,
    });
  }

  const plan = planSync(local, remote);

  const outcome: SyncOutcome = {
    pushed: [],
    pulled: [],
    deletedLocally: [],
    deletedRemotely: [],
    unchanged: plan.unchanged.map((id) => logicalByBlinded.get(id) ?? id),
    conflicts: plan.conflicts.map((c) => ({
      ...c,
      id: logicalByBlinded.get(c.id) ?? c.id,
    })),
    bookmarks: [],
    rejected: [],
  };

  for (const blinded of plan.push) {
    const record = recordByBlinded.get(blinded);
    if (!record) continue;
    // The transport is handed ciphertext and nothing else.
    const sealed = await seal(dataKey, {
      kind: record.kind,
      logicalId: record.logicalId,
      payload: record.payload,
      updatedAt: record.updatedAt,
    });
    await transport.put(blinded, sealed, record.updatedAt);
    outcome.pushed.push(record.logicalId);
  }

  for (const blinded of plan.deleteRemote) {
    await transport.remove(blinded, now);
    outcome.deletedRemotely.push(logicalByBlinded.get(blinded) ?? blinded);
  }

  for (const blinded of plan.pull) {
    const sealed = await transport.get(blinded);
    if (!sealed) {
      outcome.rejected.push({ id: blinded, reason: "The server listed a record it did not have." });
      continue;
    }

    let envelope: SealedEnvelope;
    try {
      envelope = await unseal<SealedEnvelope>(dataKey, sealed);
    } catch {
      /* Either this row belongs to a different key or it was altered. Both are
       * refusals, never a partial apply. */
      outcome.rejected.push({
        id: blinded,
        reason: "Could not be decrypted with this account's key.",
      });
      continue;
    }

    if (!isSyncedKind(envelope.kind)) {
      outcome.rejected.push({
        id: blinded,
        reason: `Unknown record kind '${String(envelope.kind)}'. A newer version of Nexora may have written it.`,
      });
      continue;
    }

    outcome.pulled.push(envelope);
    logicalByBlinded.set(blinded, envelope.logicalId);
    // This device now matches the server for this record, so the bookmark it
    // gets must hash the payload that just arrived, not the one it replaced.
    hashByLogical.set(
      envelope.logicalId,
      await hashRecordContent(envelope.kind, envelope.payload)
    );
  }

  for (const blinded of plan.deleteLocal) {
    outcome.deletedLocally.push(logicalByBlinded.get(blinded) ?? blinded);
  }

  /* Re-list so bookmarks record the revisions that now exist, including the ones
   * this run just created. Without this the next sync would re-push everything. */
  const settled = await transport.list();
  const revisionById = new Map(settled.map((r) => [r.id, r]));
  const deletedLogical = new Set(outcome.deletedRemotely.concat(outcome.deletedLocally));

  for (const [blinded, logicalId] of logicalByBlinded) {
    if (deletedLogical.has(logicalId)) continue;
    const row = revisionById.get(blinded);
    if (!row || row.deleted) continue;

    const contentHash =
      hashByLogical.get(logicalId) ?? bookmarkByLogical.get(logicalId)?.contentHash;
    // No hash means this device neither holds nor pulled the record, so there is
    // nothing to bookmark against.
    if (!contentHash) continue;

    outcome.bookmarks.push({ logicalId, blinded, baseRevision: row.revision, contentHash });
  }
  outcome.bookmarks.sort((a, b) => a.logicalId.localeCompare(b.logicalId));

  return outcome;
}
