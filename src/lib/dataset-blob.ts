/* A whole dataset, compressed and sealed, as bytes bound for Storage.
 *
 * Separate from `seal`/`unseal` in crypto.ts on purpose. Those return base64
 * inside a JSON envelope, which is right for a recipe measured in kilobytes and
 * wrong here twice over: base64 adds a third again to something that can already
 * be tens of megabytes, and `sync_records` caps ciphertext at 1 MB regardless.
 * Datasets go to a Storage bucket as raw bytes instead.
 *
 * Compression happens before sealing, never after. Parsed rows are JSON objects
 * that repeat every column name on every row, so the serialized form of a modest
 * CSV is several times the file it came from; gzip removes exactly that
 * redundancy. Sealed bytes are indistinguishable from noise and would not
 * compress at all, which is why the order is not a matter of taste.
 *
 * Layout:  [0] version  [1..12] nonce  [13..] ciphertext
 */

import type { Dataset } from "./types";

export const DATASET_BLOB_VERSION = 1;

const NONCE_BYTES = 12;
const HEADER_BYTES = 1 + NONCE_BYTES;

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Compress, seal, and frame a dataset. The nonce is fresh every call, so two
 *  seals of an unchanged dataset differ — otherwise the bytes alone would tell
 *  the server which datasets had not changed since the last upload. */
export async function sealDataset(dataKey: CryptoKey, dataset: Dataset): Promise<Uint8Array> {
  const compressed = await gzip(new TextEncoder().encode(JSON.stringify(dataset)));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, dataKey, compressed as BufferSource)
  );

  const blob = new Uint8Array(HEADER_BYTES + ciphertext.byteLength);
  blob[0] = DATASET_BLOB_VERSION;
  blob.set(nonce, 1);
  blob.set(ciphertext, HEADER_BYTES);
  return blob;
}

/** The inverse. Throws rather than returning a partial dataset: AES-GCM's tag
 *  makes a truncated or edited blob a decryption failure, and a caller that got
 *  half a table back would have no way to know it. */
export async function openDataset(dataKey: CryptoKey, blob: Uint8Array): Promise<Dataset> {
  if (blob.byteLength <= HEADER_BYTES) {
    throw new Error("Dataset blob is too short to contain anything.");
  }
  if (blob[0] !== DATASET_BLOB_VERSION) {
    throw new Error(
      `Dataset blob version ${blob[0]} was written by a newer build of Nexora than this one.`
    );
  }

  const nonce = blob.subarray(1, HEADER_BYTES);
  const ciphertext = blob.subarray(HEADER_BYTES);

  const compressed = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      dataKey,
      ciphertext as BufferSource
    )
  );

  return JSON.parse(new TextDecoder().decode(await gunzip(compressed))) as Dataset;
}
