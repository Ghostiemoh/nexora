import { describe, it, expect } from "vitest";
import {
  KDF_ITERATIONS,
  normalizeEmail,
  deriveSalt,
  deriveSecrets,
  generateDataKey,
  wrapDataKey,
  unwrapDataKey,
  seal,
  unseal,
  blindId,
  generateRecoveryCodes,
  isRecoveryCode,
  toBase64,
  fromBase64,
  emptyKeyRing,
  unlockKeyRing,
  issueRecoveryCodes,
} from "./crypto";

/* PBKDF2 at the production iteration count costs a few hundred milliseconds a
 * call, so the derivation tests run at a low count and one separate test holds
 * the shipped constant to account. */
const FAST = 1_000;

const EMAIL = "Analyst@Example.com ";
const PASSWORD = "correct horse battery staple";

describe("base64 helpers", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    expect(new Uint8Array(fromBase64(toBase64(bytes)))).toEqual(bytes);
  });

  it("round-trips an empty buffer", () => {
    expect(new Uint8Array(fromBase64(toBase64(new Uint8Array())))).toEqual(new Uint8Array());
  });
});

describe("normalizeEmail", () => {
  it("folds the casing and spacing that would otherwise change the salt", () => {
    expect(normalizeEmail(EMAIL)).toBe("analyst@example.com");
    expect(normalizeEmail("  ANALYST@EXAMPLE.COM")).toBe("analyst@example.com");
  });
});

describe("deriveSalt", () => {
  it("is deterministic, so a new device can derive before it can ask the server anything", async () => {
    const a = await deriveSalt(EMAIL);
    const b = await deriveSalt("analyst@example.com");
    expect(toBase64(a)).toBe(toBase64(b));
  });

  it("differs per account", async () => {
    const a = await deriveSalt("one@example.com");
    const b = await deriveSalt("two@example.com");
    expect(toBase64(a)).not.toBe(toBase64(b));
  });
});

describe("deriveSecrets", () => {
  it("produces the same pair for the same inputs", async () => {
    const a = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const b = await deriveSecrets(PASSWORD, EMAIL, FAST);
    expect(a.authSecret).toBe(b.authSecret);
  });

  it("changes completely when the password changes", async () => {
    const a = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const b = await deriveSecrets(`${PASSWORD}!`, EMAIL, FAST);
    expect(a.authSecret).not.toBe(b.authSecret);
  });

  it("changes when the same password is used on a different account", async () => {
    const a = await deriveSecrets(PASSWORD, "one@example.com", FAST);
    const b = await deriveSecrets(PASSWORD, "two@example.com", FAST);
    expect(a.authSecret).not.toBe(b.authSecret);
  });

  it("never hands the raw password to the auth provider", async () => {
    const { authSecret } = await deriveSecrets(PASSWORD, EMAIL, FAST);
    expect(authSecret).not.toContain(PASSWORD);
    expect(authSecret).not.toBe(PASSWORD);
  });

  /* The whole zero-knowledge claim rests on this: the value the server receives
   * and the key that decrypts the data are derived under different context
   * strings, so holding the first reveals nothing about the second. */
  it("derives the wrapping key from different material than the auth secret", async () => {
    const { authSecret, wrappingKey } = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const raw = await crypto.subtle.exportKey("raw", wrappingKey);
    expect(toBase64(new Uint8Array(raw))).not.toBe(authSecret);
  });

  it("ships a deliberately expensive iteration count", () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });
});

describe("data key wrapping", () => {
  it("unwraps back to a key that opens what the original sealed", async () => {
    const dataKey = await generateDataKey();
    const { wrappingKey } = await deriveSecrets(PASSWORD, EMAIL, FAST);

    const sealed = await seal(dataKey, { hello: "world" });
    const wrapped = await wrapDataKey(dataKey, wrappingKey);
    const recovered = await unwrapDataKey(wrapped, wrappingKey);

    expect(await unseal(recovered, sealed)).toEqual({ hello: "world" });
  });

  it("refuses a wrapping key derived from the wrong password", async () => {
    const dataKey = await generateDataKey();
    const right = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const wrong = await deriveSecrets("not the password", EMAIL, FAST);

    const wrapped = await wrapDataKey(dataKey, right.wrappingKey);
    await expect(unwrapDataKey(wrapped, wrong.wrappingKey)).rejects.toThrow();
  });

  /* One random data key wrapped once per credential is what lets Google, a
   * password, and a recovery code all open the same vault, and what makes a
   * password change re-wrap one small key instead of the whole workspace. */
  it("lets two different credentials unwrap the same data key", async () => {
    const dataKey = await generateDataKey();
    const viaPassword = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const viaPassphrase = await deriveSecrets("a different passphrase", EMAIL, FAST);

    const wrappedA = await wrapDataKey(dataKey, viaPassword.wrappingKey);
    const wrappedB = await wrapDataKey(dataKey, viaPassphrase.wrappingKey);

    const fromA = await unwrapDataKey(wrappedA, viaPassword.wrappingKey);
    const fromB = await unwrapDataKey(wrappedB, viaPassphrase.wrappingKey);

    const sealed = await seal(fromA, { shared: true });
    expect(await unseal(fromB, sealed)).toEqual({ shared: true });
  });

  it("produces a different wrapping every time, so the blob leaks no equality", async () => {
    const dataKey = await generateDataKey();
    const { wrappingKey } = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const a = await wrapDataKey(dataKey, wrappingKey);
    const b = await wrapDataKey(dataKey, wrappingKey);
    expect(a.wrapped).not.toBe(b.wrapped);
  });
});

describe("seal and unseal", () => {
  it("round-trips the shapes a workspace actually holds", async () => {
    const dataKey = await generateDataKey();
    const payload = {
      ops: [{ kind: "trimWhitespace" }, { kind: "dropColumn", column: "__EMPTY" }],
      name: "Sales — Septembre 2026 ✓",
      nested: { deep: [1, 2.5, null, true, "x"] },
      empty: {},
    };
    const sealed = await seal(dataKey, payload);
    expect(await unseal(dataKey, sealed)).toEqual(payload);
  });

  it("never emits the plaintext in the ciphertext", async () => {
    const dataKey = await generateDataKey();
    const sealed = await seal(dataKey, { customer: "Acme Corporation" });
    expect(sealed.ciphertext).not.toContain("Acme");
    expect(atob(sealed.ciphertext)).not.toContain("Acme");
  });

  it("produces different ciphertext for identical input", async () => {
    const dataKey = await generateDataKey();
    const a = await seal(dataKey, { same: 1 });
    const b = await seal(dataKey, { same: 1 });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("rejects a tampered payload rather than returning altered data", async () => {
    const dataKey = await generateDataKey();
    const sealed = await seal(dataKey, { amount: 100 });

    const bytes = new Uint8Array(fromBase64(sealed.ciphertext));
    bytes[0] ^= 0xff;
    const tampered = { ...sealed, ciphertext: toBase64(bytes) };

    await expect(unseal(dataKey, tampered)).rejects.toThrow();
  });

  it("rejects the right ciphertext under the wrong key", async () => {
    const sealed = await seal(await generateDataKey(), { amount: 100 });
    await expect(unseal(await generateDataKey(), sealed)).rejects.toThrow();
  });
});

describe("blindId", () => {
  it("is stable for the same key and logical id, so both devices agree", async () => {
    const dataKey = await generateDataKey();
    const a = await blindId(dataKey, "recipe:monthly-sales");
    const b = await blindId(dataKey, "recipe:monthly-sales");
    expect(a).toBe(b);
  });

  it("separates different records", async () => {
    const dataKey = await generateDataKey();
    const a = await blindId(dataKey, "recipe:monthly-sales");
    const b = await blindId(dataKey, "recipe:headcount");
    expect(a).not.toBe(b);
  });

  it("separates different accounts holding the same logical id", async () => {
    const a = await blindId(await generateDataKey(), "recipe:monthly-sales");
    const b = await blindId(await generateDataKey(), "recipe:monthly-sales");
    expect(a).not.toBe(b);
  });

  /* The server indexes rows by this value, so it must not carry the name of
   * the thing it points at. */
  it("does not leak the logical id it came from", async () => {
    const dataKey = await generateDataKey();
    const id = await blindId(dataKey, "recipe:monthly-sales");
    expect(id).not.toContain("recipe");
    expect(id).not.toContain("monthly");
  });

  it("is URL-safe, since it travels as a row key", async () => {
    const id = await blindId(await generateDataKey(), "recipe:x");
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("the key ring", () => {
  it("unlocks from whichever credential the user actually has", async () => {
    const dataKey = await generateDataKey();
    const viaPassword = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const viaPassphrase = await deriveSecrets("google user passphrase", EMAIL, FAST);
    const { codes, wrapped } = await issueRecoveryCodes(dataKey, EMAIL, 2, FAST);

    const ring = {
      ...emptyKeyRing(),
      password: await wrapDataKey(dataKey, viaPassword.wrappingKey),
      passphrase: await wrapDataKey(dataKey, viaPassphrase.wrappingKey),
      recovery: wrapped,
    };

    const sealed = await seal(dataKey, { vault: "shared" });
    for (const secret of [PASSWORD, "google user passphrase", codes[0], codes[1]]) {
      const unlocked = await unlockKeyRing(ring, secret, EMAIL, FAST);
      expect(await unseal(unlocked, sealed)).toEqual({ vault: "shared" });
    }
  });

  it("refuses a secret that matches no slot, with a message a person can act on", async () => {
    const dataKey = await generateDataKey();
    const { wrappingKey } = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const ring = { ...emptyKeyRing(), password: await wrapDataKey(dataKey, wrappingKey) };

    await expect(unlockKeyRing(ring, "wrong", EMAIL, FAST)).rejects.toThrow(
      /did not unlock this account/i
    );
  });

  it("refuses an empty ring rather than returning a usable key", async () => {
    await expect(unlockKeyRing(emptyKeyRing(), PASSWORD, EMAIL, FAST)).rejects.toThrow();
  });

  /* Changing a password re-wraps one small key. The data does not move, and
   * every other credential on the ring keeps working. */
  it("survives a password change without touching the data", async () => {
    const dataKey = await generateDataKey();
    const old = await deriveSecrets(PASSWORD, EMAIL, FAST);
    const fresh = await deriveSecrets("a new password", EMAIL, FAST);
    const { codes, wrapped } = await issueRecoveryCodes(dataKey, EMAIL, 1, FAST);

    const sealed = await seal(dataKey, { untouched: true });
    let ring = {
      ...emptyKeyRing(),
      password: await wrapDataKey(dataKey, old.wrappingKey),
      recovery: wrapped,
    };

    const unlocked = await unlockKeyRing(ring, PASSWORD, EMAIL, FAST);
    ring = { ...ring, password: await wrapDataKey(unlocked, fresh.wrappingKey) };

    expect(await unseal(await unlockKeyRing(ring, "a new password", EMAIL, FAST), sealed)).toEqual({
      untouched: true,
    });
    // The old password is gone, the recovery code is not.
    await expect(unlockKeyRing(ring, PASSWORD, EMAIL, FAST)).rejects.toThrow();
    expect(await unseal(await unlockKeyRing(ring, codes[0], EMAIL, FAST), sealed)).toEqual({
      untouched: true,
    });
  });
});

describe("recovery codes", () => {
  it("issues ten distinct codes by default", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("formats them so they can be read off paper without ambiguity", () => {
    for (const code of generateRecoveryCodes(3)) {
      expect(code).toMatch(/^NXRA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
      // 0/O/1/I/L are excluded on purpose.
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("recognizes its own codes and rejects noise", () => {
    const [code] = generateRecoveryCodes(1);
    expect(isRecoveryCode(code)).toBe(true);
    expect(isRecoveryCode(code.toLowerCase())).toBe(true);
    expect(isRecoveryCode("NXRA-0000-0000-0000")).toBe(false);
    expect(isRecoveryCode("hunter2")).toBe(false);
  });

  it("issues codes that each independently open the vault", async () => {
    const dataKey = await generateDataKey();
    const { codes, wrapped } = await issueRecoveryCodes(dataKey, EMAIL, 3, FAST);
    const ring = { ...emptyKeyRing(), recovery: wrapped };

    const sealed = await seal(dataKey, { ok: true });
    for (const code of codes) {
      const unlocked = await unlockKeyRing(ring, code, EMAIL, FAST);
      expect(await unseal(unlocked, sealed)).toEqual({ ok: true });
    }
  });

  it("opens the vault when the password is gone", async () => {
    const dataKey = await generateDataKey();
    const [code] = generateRecoveryCodes(1);

    const viaCode = await deriveSecrets(code, EMAIL, FAST);
    const wrapped = await wrapDataKey(dataKey, viaCode.wrappingKey);

    const recovered = await unwrapDataKey(wrapped, viaCode.wrappingKey);
    const sealed = await seal(dataKey, { rescued: true });
    expect(await unseal(recovered, sealed)).toEqual({ rescued: true });
  });
});
