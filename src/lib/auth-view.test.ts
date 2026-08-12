import { describe, it, expect } from "vitest";
import {
  authView,
  isMidFlow,
  AUTH_COPY,
  SKIP_DESTINATION,
  DONE_DESTINATION,
  type AuthView,
} from "./auth-view";
import type { SyncStage } from "./sync-store";

const ALL_STAGES: SyncStage[] = [
  "unconfigured",
  "signedOut",
  "awaitingConfirmation",
  "needsSetup",
  "locked",
  "unlocked",
];

describe("authView", () => {
  it("has an answer for every stage, so a new one cannot fall through", () => {
    for (const stage of ALL_STAGES) {
      expect(authView(stage), stage).toBeDefined();
    }
  });

  it("offers the form only when there is nobody signed in", () => {
    const asForm = ALL_STAGES.filter((s) => authView(s) === "form");
    expect(asForm).toEqual(["signedOut"]);
  });

  /* A deployment without Supabase credentials has no account to sign into. It
   * has to say so rather than render a form that cannot succeed. */
  it("says sign-in is unavailable when the deployment has no credentials", () => {
    expect(authView("unconfigured")).toBe("unavailable");
  });

  it("keeps someone on the page while their account is still half made", () => {
    expect(authView("awaitingConfirmation")).toBe("continue");
    expect(authView("needsSetup")).toBe("continue");
    expect(authView("locked")).toBe("continue");
  });

  it("has nothing left to ask once the vault is open", () => {
    expect(authView("unlocked")).toBe("done");
  });
});

describe("isMidFlow", () => {
  it("is true exactly for the stages that still need input", () => {
    const midFlow = ALL_STAGES.filter(isMidFlow);
    expect(midFlow).toEqual(["awaitingConfirmation", "needsSetup", "locked"]);
  });

  it("is false when signed out, finished, or unavailable", () => {
    expect(isMidFlow("signedOut")).toBe(false);
    expect(isMidFlow("unlocked")).toBe(false);
    expect(isMidFlow("unconfigured")).toBe(false);
  });
});

describe("destinations", () => {
  /* Someone who just declined an account came here to work. Sending them to
   * the marketing home reads as a punishment for saying no. */
  it("sends both skip and finish to the dataset picker", () => {
    expect(SKIP_DESTINATION).toBe("/launch");
    expect(DONE_DESTINATION).toBe("/launch");
  });
});

describe("AUTH_COPY", () => {
  it("covers both modes", () => {
    expect(Object.keys(AUTH_COPY).sort()).toEqual(["in", "up"]);
  });

  it("points each mode at the other", () => {
    expect(AUTH_COPY.in.switchHref).toBe("/sign-up");
    expect(AUTH_COPY.up.switchHref).toBe("/sign-in");
  });

  /* The whole point of the page. If the copy ever stops saying that the app
   * works without an account, the page has quietly become a gate. */
  it("says out loud that an account is not required", () => {
    expect(AUTH_COPY.in.lede).toMatch(/without it|already works/i);
    expect(AUTH_COPY.up.lede).toMatch(/one reason|nothing else/i);
  });

  it("never promises a password reset, because there cannot be one", () => {
    const all = Object.values(AUTH_COPY)
      .map((c) => `${c.title} ${c.lede}`)
      .join(" ");
    expect(all).not.toMatch(/forgot your password|reset your password/i);
  });

  it("writes distinct submit labels, so the button never lies about the mode", () => {
    expect(AUTH_COPY.in.submit).not.toBe(AUTH_COPY.up.submit);
  });
});

describe("the view type stays exhaustive", () => {
  it("produces only known views", () => {
    const known: AuthView[] = ["form", "unavailable", "continue", "done"];
    for (const stage of ALL_STAGES) {
      expect(known).toContain(authView(stage));
    }
  });
});
