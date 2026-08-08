/* What leaves the device, and what provably does not.
 *
 * Phase 1 syncs the reusable half of a workspace: the cleaning recipes and the
 * team roster. Datasets stay where they were imported. That is not a placeholder
 * for "datasets later"; it is the shape that makes the monthly close work on a
 * second device, because the recipe is the expensive artifact and this month's
 * export is a download away from wherever it came from.
 *
 * A recipe is NOT metadata. `mergeValues` and `findReplace` ops carry real cell
 * values, so a recipe can contain `"Demorcatic" -> "Democratic"` or a customer's
 * actual name. Everything here is sealed with the account data key before it goes
 * anywhere, and there is deliberately no plaintext tier to be talked into. */

import { fingerprintDataset, fingerprintKey, type DatasetFingerprint } from "./fingerprint";
import type { CleanOp, Dataset, TeamMember } from "./types";

export const SYNC_PAYLOAD_VERSION = 1 as const;

/** The complete set of record kinds that may be transmitted. Anything absent
 *  from this list has no code path to the server. */
export const SYNCED_KINDS = ["recipe", "roster"] as const;
export type SyncedKind = (typeof SYNCED_KINDS)[number];

/** Held locally and never transmitted, with the reason, so a future change has
 *  to argue with a stated decision instead of an omission. `sync-payload.test.ts`
 *  asserts each of these stays out of the record set. */
export const NEVER_SYNCED: Record<string, string> = {
  datasets: "The rows themselves. Phase 1 keeps them on the device that imported them.",
  connections: "Postgres and MySQL connection strings, which carry live credentials.",
  geminiApiKey: "A user's own API key. It is a secret, and it is cheap to paste per device.",
  exportHistory: "Stored export payloads, which contain dataset content verbatim.",
  chatHistory: "AI answers quote real cell values back, so the transcript is data.",
  auditLog: "A per-device record of what happened on that device. Merging it would be a lie.",
  notifications: "Ephemeral and device-local.",
  pinnedCharts: "Keyed by local dataset id, which is not portable. Needs a schema key first.",
};

/** One record as the sync engine sees it, before sealing. */
export interface SyncRecord {
  /** stable across devices; becomes a blinded id before it reaches the server */
  logicalId: string;
  kind: SyncedKind;
  payload: unknown;
  updatedAt: number;
}

export interface RecipeBookEntry {
  /** stable schema identity, so any device can match a file to this recipe */
  schema: string;
  fingerprint: DatasetFingerprint;
  ops: CleanOp[];
  /** the dataset this was recorded from, for display only */
  sourceName: string;
  updatedAt: number;
}

/** Recipes worth carrying: one per distinct schema, newest kept when two
 *  datasets on this device share a shape. */
export function buildRecipeBook(datasets: readonly Dataset[]): RecipeBookEntry[] {
  const bySchema = new Map<string, RecipeBookEntry>();

  for (const dataset of datasets) {
    if (!dataset.recipe || dataset.recipe.length === 0) continue;

    const fingerprint = fingerprintDataset(dataset);
    if (fingerprint.columns.length === 0) continue;

    const schema = fingerprintKey(fingerprint);
    const existing = bySchema.get(schema);
    if (existing && existing.updatedAt >= dataset.updatedAt) continue;

    bySchema.set(schema, {
      schema,
      fingerprint,
      ops: dataset.recipe,
      sourceName: dataset.name,
      updatedAt: dataset.updatedAt,
    });
  }

  return [...bySchema.values()].sort((a, b) => a.schema.localeCompare(b.schema));
}

/** Union two books by schema, newer entry winning. Used when a pull lands on a
 *  device that has recipes of its own. */
export function mergeRecipeBooks(
  local: readonly RecipeBookEntry[],
  incoming: readonly RecipeBookEntry[]
): RecipeBookEntry[] {
  const merged = new Map<string, RecipeBookEntry>();
  for (const entry of local) merged.set(entry.schema, entry);
  for (const entry of incoming) {
    const existing = merged.get(entry.schema);
    if (!existing || entry.updatedAt > existing.updatedAt) merged.set(entry.schema, entry);
  }
  return [...merged.values()].sort((a, b) => a.schema.localeCompare(b.schema));
}

export interface SyncSource {
  datasets: readonly Dataset[];
  teamMembers: readonly TeamMember[];
  /** last local change to the roster; the store has no per-member stamp */
  rosterUpdatedAt: number;
}

/** Turn the syncable slice of a workspace into records. The only producer of
 *  outbound data, so the allowlist is enforced in exactly one place. */
export function buildSyncRecords(source: SyncSource): SyncRecord[] {
  const records: SyncRecord[] = [];

  for (const entry of buildRecipeBook(source.datasets)) {
    records.push({
      logicalId: `recipe:${entry.schema}`,
      kind: "recipe",
      payload: entry,
      updatedAt: entry.updatedAt,
    });
  }

  if (source.teamMembers.length > 0) {
    records.push({
      logicalId: "roster",
      kind: "roster",
      payload: source.teamMembers,
      updatedAt: source.rosterUpdatedAt,
    });
  }

  return records;
}

/** Reject a record whose kind is not in the allowlist, so a payload invented by
 *  a future version, or by a tampered row, cannot be applied by an older client. */
export function isSyncedKind(value: unknown): value is SyncedKind {
  return typeof value === "string" && (SYNCED_KINDS as readonly string[]).includes(value);
}

export function parseRecipeBookEntry(payload: unknown): RecipeBookEntry {
  const entry = payload as Partial<RecipeBookEntry>;
  if (
    !entry ||
    typeof entry.schema !== "string" ||
    !Array.isArray(entry.ops) ||
    !entry.fingerprint ||
    !Array.isArray(entry.fingerprint.columns)
  ) {
    throw new Error("Not a Nexora recipe record.");
  }
  return {
    schema: entry.schema,
    fingerprint: entry.fingerprint,
    ops: entry.ops,
    sourceName: entry.sourceName ?? "unknown",
    updatedAt: entry.updatedAt ?? 0,
  };
}
