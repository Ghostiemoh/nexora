/* Zero-knowledge primitives for cross-device sync.
 *
 * The rule the whole design serves: the server may hold Nexora's ciphertext but
 * must never hold anything that opens it. So the account password is derived
 * twice under different context strings. One derivation becomes the secret the
 * auth provider stores and checks; the other never leaves the device and wraps
 * the data key. Holding the first tells you nothing about the second.
 *
 * Google sign-in has no user-held secret, so it supplies identity only and the
 * key comes from a passphrase set once per account and entered once per device.
 * Both paths converge on one random data key, wrapped separately per credential,
 * which is what lets a password, a passphrase, and a recovery code all open the
 * same vault and what makes a password change re-wrap one small key instead of
 * re-encrypting the workspace.
 *
 * WebCrypto only, so this module runs unchanged in the browser and under test. */

/** PBKDF2-SHA256 rounds. WebCrypto offers no Argon2 and pulling in a wasm build
 *  for one function is not worth the supply-chain surface, so the cost is bought
 *  with iterations instead. Matches the current OWASP guidance for PBKDF2. */
export const KDF_ITERATIONS = 600_000;

export const CRYPTO_VERSION = 1 as const;

/** Bound into every derivation so a hash from this app can never be replayed
 *  against another that happens to use the same scheme. */
const DOMAIN = "nexora.sync.v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* ── encoding ── */

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked so a large payload cannot blow the argument limit on spread.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ── salt ── */

/** Fold the casing and spacing a person will vary between devices, so the same
 *  account always derives the same salt. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The salt is derived from the account address rather than stored, because a
 *  new device has to derive its keys before it is allowed to ask the server for
 *  anything. It is not secret; it only has to be unique per account. */
export async function deriveSalt(email: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${DOMAIN}.salt:${normalizeEmail(email)}`)
  );
  return new Uint8Array(digest);
}

/* ── dual derivation ── */

export interface DerivedSecrets {
  /** Handed to the auth provider as the account secret. The raw password never
   *  goes anywhere, so the provider cannot derive the wrapping key from what it
   *  stores even if its entire database is read. */
  authSecret: string;
  /** Stays on this device. Wraps and unwraps the data key. */
  wrappingKey: CryptoKey;
}

async function pbkdf2(
  secret: string,
  salt: Uint8Array,
  iterations: number,
  context: string,
  bits: number
): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, [
    "deriveBits",
  ]);
  // The context string is folded into the salt, which is what separates the two
  // derivations: same password, same iterations, unrelated output.
  const scoped = encoder.encode(`${DOMAIN}.${context}:`);
  const combined = new Uint8Array(scoped.length + salt.length);
  combined.set(scoped, 0);
  combined.set(salt, scoped.length);

  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: combined, iterations, hash: "SHA-256" },
    base,
    bits
  );
}

/** Derive the pair from a password, a passphrase, or a recovery code. The caller
 *  decides which of the three it is; the maths is identical. */
export async function deriveSecrets(
  secret: string,
  email: string,
  iterations: number = KDF_ITERATIONS
): Promise<DerivedSecrets> {
  const salt = await deriveSalt(email);

  const [authBits, wrapBits] = await Promise.all([
    pbkdf2(secret, salt, iterations, "auth", 256),
    pbkdf2(secret, salt, iterations, "wrap", 256),
  ]);

  const wrappingKey = await crypto.subtle.importKey("raw", wrapBits, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);

  return { authSecret: toBase64(new Uint8Array(authBits)), wrappingKey };
}

/* ── the data key ── */

/** Extractable on purpose: wrapping it for each credential means encrypting its
 *  raw bytes, and re-wrapping on a password change means reading them again. It
 *  only ever exists in memory on an unlocked device. */
export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export interface WrappedKey {
  version: typeof CRYPTO_VERSION;
  iv: string;
  wrapped: string;
}

export async function wrapDataKey(
  dataKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<WrappedKey> {
  const raw = await crypto.subtle.exportKey("raw", dataKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, raw);
  return {
    version: CRYPTO_VERSION,
    iv: toBase64(iv),
    wrapped: toBase64(new Uint8Array(wrapped)),
  };
}

/** Throws when the wrapping key is wrong, which is how a bad password or a bad
 *  recovery code is detected: there is no separate check value to compare. */
export async function unwrapDataKey(
  wrapped: WrappedKey,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(fromBase64(wrapped.iv)) },
    wrappingKey,
    fromBase64(wrapped.wrapped)
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}

/* ── the key ring ── */

/** Every wrapped copy of one account's data key. Stored server-side and inert
 *  without a secret the user supplies: each entry is an AES-GCM blob whose
 *  unwrapping key is derived on the device and never transmitted.
 *
 *  Google sign-in fills `passphrase`, since OAuth provides identity but no
 *  user-held secret to derive from. Email and password fills `password`, where
 *  the same input does both jobs. Both converge on the same data key. */
export interface WrappedKeyRing {
  version: typeof CRYPTO_VERSION;
  password?: WrappedKey;
  passphrase?: WrappedKey;
  /** one per issued recovery code, so using one does not invalidate the others */
  recovery: WrappedKey[];
}

export function emptyKeyRing(): WrappedKeyRing {
  return { version: CRYPTO_VERSION, recovery: [] };
}

/** Try a secret against every slot on the ring. There is no check value to
 *  compare against, so a wrong secret is detected by AES-GCM refusing to
 *  authenticate, which is why each attempt is wrapped in its own catch. */
export async function unlockKeyRing(
  ring: WrappedKeyRing,
  secret: string,
  email: string,
  iterations: number = KDF_ITERATIONS
): Promise<CryptoKey> {
  const { wrappingKey } = await deriveSecrets(secret, email, iterations);

  const slots = [ring.password, ring.passphrase, ...ring.recovery].filter(
    (slot): slot is WrappedKey => Boolean(slot)
  );

  for (const slot of slots) {
    try {
      return await unwrapDataKey(slot, wrappingKey);
    } catch {
      // Wrong slot for this secret. Keep going.
    }
  }

  throw new Error("That password, passphrase, or recovery code did not unlock this account.");
}

/** Issue a fresh set of recovery codes for an already-unlocked data key. Returns
 *  the plaintext codes to show once, and the ring entries to store. */
export async function issueRecoveryCodes(
  dataKey: CryptoKey,
  email: string,
  count = 10,
  iterations: number = KDF_ITERATIONS
): Promise<{ codes: string[]; wrapped: WrappedKey[] }> {
  const codes = generateRecoveryCodes(count);
  const wrapped = await Promise.all(
    codes.map(async (code) => {
      const { wrappingKey } = await deriveSecrets(code, email, iterations);
      return wrapDataKey(dataKey, wrappingKey);
    })
  );
  return { codes, wrapped };
}

/* ── payloads ── */

export interface Sealed {
  version: typeof CRYPTO_VERSION;
  iv: string;
  ciphertext: string;
}

export async function seal(dataKey: CryptoKey, payload: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    dataKey,
    encoder.encode(JSON.stringify(payload))
  );
  return {
    version: CRYPTO_VERSION,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Throws on a wrong key or a tampered payload. AES-GCM authenticates, so there
 *  is no path that quietly returns altered data. */
export async function unseal<T>(dataKey: CryptoKey, sealed: Sealed): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(fromBase64(sealed.iv)) },
    dataKey,
    fromBase64(sealed.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

/* ── blinded record ids ── */

/** The server indexes rows by id, so the id cannot be the name of the thing it
 *  points at. An HMAC under a key derived from the data key is deterministic, so
 *  two devices compute the same id for the same record, and opaque, so the
 *  server learns nothing from it. */
export async function blindId(dataKey: CryptoKey, logicalId: string): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", dataKey);
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveBits"]);
  const indexBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encoder.encode(`${DOMAIN}.blind-index`),
    },
    base,
    256
  );
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    indexBits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(logicalId));
  return toBase64Url(new Uint8Array(mac));
}

/* ── recovery codes ── */

/** Crockford-ish alphabet: no 0/O/1/I/L, so a code read off paper cannot be
 *  transcribed into a different one. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_PATTERN = /^NXRA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

function codeGroup(): string {
  const picks = crypto.getRandomValues(new Uint8Array(4));
  let group = "";
  for (const pick of picks) group += CODE_ALPHABET[pick % CODE_ALPHABET.length];
  return group;
}

/** The only route back in when the passphrase is gone. Each one wraps the data
 *  key independently, so any single code is enough and using one does not
 *  invalidate the others. */
export function generateRecoveryCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(`NXRA-${codeGroup()}-${codeGroup()}-${codeGroup()}`);
  }
  return [...codes];
}

export function isRecoveryCode(value: string): boolean {
  return CODE_PATTERN.test(value.trim().toUpperCase());
}
