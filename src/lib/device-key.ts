/* Device trust: what turns "enter your passphrase every visit" into "enter it
 * once on this device".
 *
 * After a successful unlock the data key is wrapped again, this time under a key
 * generated with `extractable: false` and held in IndexedDB. Script on the page
 * can ask that key to unwrap, but neither script nor anything reading the
 * database file can read the key itself, which is meaningfully better than
 * stashing the passphrase or the raw data key anywhere.
 *
 * Browser only, and deliberately thin: everything that can be reasoned about
 * lives in `crypto.ts` under test. Every function here fails soft, because a
 * blocked or evicted IndexedDB should cost the reader one passphrase prompt, not
 * access to their workspace. */

import { CRYPTO_VERSION, toBase64, fromBase64, type WrappedKey } from "./crypto";

const DB_NAME = "nexora-device";
const STORE = "keys";
const DEVICE_KEY_ID = "device-key";
const WRAPPED_ID = "wrapped-data-key";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function read<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

function write(db: IDBDatabase, key: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/** A per-device key that cannot be exported, only used. Created on first trust
 *  and reused after. */
async function deviceKey(db: IDBDatabase): Promise<CryptoKey | null> {
  const existing = await read<CryptoKey>(db, DEVICE_KEY_ID);
  if (existing) return existing;

  const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  // A CryptoKey survives structured clone, so the non-extractable key itself is
  // what gets stored, never its bytes.
  return (await write(db, DEVICE_KEY_ID, fresh)) ? fresh : null;
}

/** Trust this device: remember the data key so the next visit does not ask.
 *  Returns whether it took, so the caller can tell the reader the truth. */
export async function trustDevice(dataKey: CryptoKey): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return false;

    const wrapper = await deviceKey(db);
    if (!wrapper) return false;

    const raw = await crypto.subtle.exportKey("raw", dataKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapper, raw);

    const record: WrappedKey = {
      version: CRYPTO_VERSION,
      iv: toBase64(iv),
      wrapped: toBase64(new Uint8Array(wrapped)),
    };
    return write(db, WRAPPED_ID, record);
  } catch {
    return false;
  }
}

/** The data key for a device that was trusted earlier, or null to fall back to
 *  asking. */
export async function recallDataKey(): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    if (!db) return null;

    const [wrapper, record] = await Promise.all([
      read<CryptoKey>(db, DEVICE_KEY_ID),
      read<WrappedKey>(db, WRAPPED_ID),
    ]);
    if (!wrapper || !record) return null;

    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(fromBase64(record.iv)) },
      wrapper,
      fromBase64(record.wrapped)
    );
    return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

/** Withdraw trust. Used on sign-out and by "forget this device" in Settings, so
 *  a shared or borrowed machine can be cleaned without touching the account. */
export async function forgetDevice(): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Nothing to withdraw.
  }
}
