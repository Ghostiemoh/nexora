/* What the account pages should be showing.
 *
 * Sign-in here is not a gate. Every feature in Nexora works without an account,
 * and an account only turns on cross-device sync, so these pages have to stay
 * honest about being optional while still handling a six-stage flow: a
 * deployment with no server credentials at all, a reader who has not signed in,
 * one waiting on a confirmation email, one who needs a vault minted, one whose
 * device cannot open the vault yet, and one who is finished.
 *
 * Deciding which of those a page renders is pure logic, so it lives here where
 * it can be tested, rather than inside a component where the only way to check
 * the "no credentials configured" branch is to unset an environment variable
 * and reload a browser. */

import type { SyncStage } from "./sync-store";

export type AuthView =
  /** collect an email and password, or offer Google */
  | "form"
  /** this deployment has no Supabase credentials, so there is nothing to sign into */
  | "unavailable"
  /** signed in, but the account still needs confirming, unlocking, or a vault */
  | "continue"
  /** signed in and unlocked: there is nothing left to do here */
  | "done";

/** Which panel the account page renders for a given sync stage. */
export function authView(stage: SyncStage): AuthView {
  switch (stage) {
    case "unconfigured":
      return "unavailable";
    case "signedOut":
      return "form";
    case "awaitingConfirmation":
    case "needsSetup":
    case "locked":
      return "continue";
    case "unlocked":
      return "done";
  }
}

/** True when the reader still has something to type or confirm.
 *
 *  Used to decide whether leaving the page mid-flow would strand a half-made
 *  account, which is why "awaitingConfirmation" counts: the account exists but
 *  has no vault, and wandering off is how someone ends up with neither. */
export function isMidFlow(stage: SyncStage): boolean {
  return authView(stage) === "continue";
}

/** Where "continue without an account" should land.
 *
 *  The dataset picker, never a dataset and never the marketing home. Someone
 *  who just declined an account came here to work, and sending them back to
 *  the front door reads as a punishment for saying no. */
export const SKIP_DESTINATION = "/launch";

/** Where a finished sign-in should land, for the same reason. */
export const DONE_DESTINATION = "/launch";

/** The headline and supporting line for each mode.
 *
 *  Kept beside the view logic so the two modes cannot drift into describing
 *  different products, which is what happens when the copy lives inside two
 *  separate page files. */
export const AUTH_COPY = {
  in: {
    title: "Sign in to sync",
    lede: "Signing in carries your datasets, cleaning recipes, and workspace roster to your other devices. It does not unlock anything here: every feature already works without it.",
    submit: "Sign in",
    switchPrompt: "No account yet?",
    switchAction: "Create one",
    switchHref: "/sign-up",
  },
  up: {
    title: "Create an account",
    lede: "An account exists for one reason: to move your work between devices, sealed on this machine before it goes. Nothing else about Nexora changes, and sync uploads nothing until you finish setting up.",
    submit: "Create account",
    switchPrompt: "Already have an account?",
    switchAction: "Sign in",
    switchHref: "/sign-in",
  },
} as const;

export type AuthMode = keyof typeof AUTH_COPY;
