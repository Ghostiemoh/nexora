/* Rules for the password that protects a synced vault.
 *
 * These have to live on the device, and this is not a stylistic preference.
 * `sync-store.ts` runs the typed password through `deriveSecrets` and sends the
 * provider the *derived* secret, never the password itself. So a password rule
 * configured in Supabase would be validating a derived string that always looks
 * strong no matter what the reader typed. This file is the only place the rule
 * can exist at all.
 *
 * The stakes are higher than a normal sign-in, too: the same password derives
 * the key that decrypts the vault, so a weak one is not merely an account
 * someone else can enter, it is data the server's ciphertext no longer protects.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId = "length" | "uppercase" | "symbol";

export interface PasswordRule {
  id: PasswordRuleId;
  /** Shown verbatim in the panel, so it reads as a requirement, not an error. */
  label: string;
  met: boolean;
}

/** An uppercase letter in any alphabet, so `É` counts. The rule is about the
 *  reader having reached for the shift key, not about ASCII. */
const UPPERCASE = /\p{Lu}/u;

/** Anything that is not a letter, a digit, or whitespace. Whitespace is excluded
 *  deliberately: a space lengthens a password without adding much an attacker
 *  must guess, and accepting it here would tell the reader they had satisfied
 *  this rule when they had mostly satisfied the previous one. */
const SYMBOL = /[^\p{L}\p{N}\s]/u;

/** Every rule and whether this password meets it, in the order the panel lists
 *  them. Returns the full set rather than the first failure so the reader can
 *  see the whole target at once instead of discovering it one rejection at a
 *  time. */
export function checkPassword(password: string): PasswordRule[] {
  return [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { id: "uppercase", label: "One uppercase letter", met: UPPERCASE.test(password) },
    { id: "symbol", label: "One symbol, such as # $ % ^ & *", met: SYMBOL.test(password) },
  ];
}

export function passwordMeetsPolicy(password: string): boolean {
  return checkPassword(password).every((rule) => rule.met);
}
