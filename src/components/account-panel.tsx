"use client";

/* The account surface: sign in, unlock, sync, and get back out again.
 *
 * One panel rather than four scattered dialogs, because every stage of this is
 * the same question asked at a different point: can this device open your vault
 * yet. Each stage renders on its own, so nothing is ever half-true on screen. */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useSync } from "@/lib/sync-store";
import { useMounted } from "@/lib/use-mounted";
import { isRecoveryCode } from "@/lib/crypto";
import { checkPassword, passwordMeetsPolicy, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const INPUT =
  "h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus-visible:border-primary";

function Panel({
  eyebrow,
  title,
  children,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  icon: typeof Cloud;
}) {
  return (
    <section className="nexora-card p-5" aria-label="Account and sync">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-primary">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-on-surface">{title}</h2>
          <div className="mt-4 space-y-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 text-xs leading-5 text-on-surface-variant">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      {children}
    </p>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex gap-2 text-xs leading-5 text-error">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

/* ── stages ── */

function Unconfigured() {
  return (
    <Panel eyebrow="Sync" title="Sync is not available on this deployment." icon={CloudOff}>
      <p className="text-sm leading-6 text-on-surface-variant">
        Nexora is running without server credentials, so there is no account to sign in to and
        nothing syncs. Everything else works exactly as it does with sync configured, including the
        database and AI features, which reach the network on their own terms whenever you use them.
      </p>
      <Note>
        Self-hosting? Set <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then apply{" "}
        <code className="font-mono text-[11px]">supabase/migrations</code>.
      </Note>
    </Panel>
  );
}

function SignedOut() {
  const {
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    busy,
    error,
    clearError,
    googleAvailable,
  } = useSync();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /* Only enforced when creating an account. An existing password that predates
   * these rules still has to be typeable, or the rules would lock people out of
   * their own vaults rather than strengthening anything. */
  const rules = checkPassword(password);
  const passwordAcceptable = mode === "in" || passwordMeetsPolicy(password);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "in") void signInWithPassword(email.trim(), password);
    else void signUpWithPassword(email.trim(), password);
  };

  return (
    <Panel eyebrow="Sync" title="Use your data on every device." icon={Cloud}>
      <p className="text-sm leading-6 text-on-surface-variant">
        Signing in syncs your datasets, cleaning recipes and team roster to your other devices,
        compressed and encrypted on this device before they are sent. Sync uploads nothing until you
        sign in, and you can delete everything from the server at any time. Database imports and the
        AI analyst reach the network on their own terms, with or without an account.
      </p>

      {/* Offered only when the project has the provider switched on. Otherwise
          the redirect lands the reader on Supabase's raw JSON error, outside the
          app, with no way back but the back button. */}
      {googleAvailable === true && (
        <>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={busy}
            className="press flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container text-sm font-medium text-on-surface transition-colors hover:bg-white/[0.06] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <span aria-hidden="true" className="font-semibold text-primary">
                G
              </span>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-outline-variant" />
            <span className="text-[11px] uppercase tracking-wider text-on-surface-variant/70">
              or
            </span>
            <span className="h-px flex-1 bg-outline-variant" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="sync-email" className="text-xs text-on-surface-variant">
            Email
          </label>
          <input
            id="sync-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearError();
            }}
            className={`mt-1 ${INPUT}`}
          />
        </div>
        <div>
          <label htmlFor="sync-password" className="text-xs text-on-surface-variant">
            Password
          </label>
          <input
            id="sync-password"
            type="password"
            required
            minLength={mode === "up" ? PASSWORD_MIN_LENGTH : undefined}
            aria-describedby={mode === "up" ? "sync-password-rules" : undefined}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            className={`mt-1 ${INPUT}`}
          />

          {/* Every rule listed at once, met or not. Revealing them one rejection
              at a time is how a reader ends up guessing at a target. */}
          {mode === "up" && (
            <ul id="sync-password-rules" className="mt-2 space-y-1">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                    rule.met ? "text-primary" : "text-on-surface-variant/70"
                  }`}
                >
                  {rule.met ? (
                    <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full border border-current opacity-40"
                    />
                  )}
                  <span>{rule.label}</span>
                  <span className="sr-only">{rule.met ? " met" : " not met yet"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={busy || !passwordAcceptable}
          className="pill h-10 w-full bg-primary text-sm text-on-primary disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "in" ? "up" : "in"));
          clearError();
        }}
        className="cursor-pointer text-xs text-primary underline-offset-2 hover:underline"
      >
        {mode === "in" ? "No account yet? Create one." : "Already have an account? Sign in."}
      </button>

      {error && <ErrorLine>{error}</ErrorLine>}

      <Note>
        Your password is put through 600,000 rounds of key derivation twice, under different context
        strings. One result signs you in. The other never leaves this device and is the only thing
        that decrypts your data.
      </Note>
    </Panel>
  );
}

function AwaitingConfirmation() {
  const { email, signOut } = useSync();

  return (
    <Panel eyebrow="Almost there" title="Confirm your email address." icon={KeyRound}>
      <p className="text-sm leading-6 text-on-surface-variant">
        An account was created for <span className="text-on-surface">{email}</span> and a
        confirmation link is on its way. Open it, then come back here and sign in. Nothing has been
        uploaded and no vault exists yet.
      </p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="press h-10 cursor-pointer rounded-lg border border-outline-variant px-4 text-sm text-on-surface-variant hover:bg-white/[0.06]"
      >
        Back to sign in
      </button>
    </Panel>
  );
}

function NeedsSetup() {
  const { completeSetup, email, busy, error, clearError, passwordWrappingKey } = useSync();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);

  /* A password sign-in already derived the key that will wrap the vault, so
   * asking for a second secret would add a thing to lose and protect nothing. */
  const usesPassword = Boolean(passwordWrappingKey);

  const mismatch = confirm.length > 0 && passphrase !== confirm;
  const ready = usesPassword
    ? understood && !busy
    : passphrase.length >= 10 && passphrase === confirm && understood && !busy;

  if (usesPassword) {
    return (
      <Panel eyebrow="One more step" title="Create your vault." icon={KeyRound}>
        <p className="text-sm leading-6 text-on-surface-variant">
          Signed in as <span className="text-on-surface">{email}</span>. Your password already
          encrypts this vault, so there is no second secret to invent. Recovery codes come next, and
          they are the only other way in.
        </p>

        <label className="flex cursor-pointer gap-2.5 rounded-lg border border-error/35 bg-error/5 p-3">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          />
          <span className="text-xs leading-5 text-on-surface-variant">
            I understand that Nexora cannot recover my synced data if I forget my password and lose my
            recovery codes. There is no master key.
          </span>
        </label>

        <button
          type="button"
          onClick={() => void completeSetup()}
          disabled={!ready}
          className="pill h-10 w-full bg-primary text-sm text-on-primary disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Create the vault
        </button>

        {error && <ErrorLine>{error}</ErrorLine>}
      </Panel>
    );
  }

  return (
    <Panel eyebrow="One more step" title="Create your encryption passphrase." icon={KeyRound}>
      <p className="text-sm leading-6 text-on-surface-variant">
        Signed in as <span className="text-on-surface">{email}</span>. Google proves who you are, but
        it cannot hold a key we are unable to read, so this passphrase is what encrypts your
        workspace. You will enter it once on each device.
      </p>

      <div>
        <label htmlFor="passphrase" className="text-xs text-on-surface-variant">
          Passphrase (10 characters or more)
        </label>
        <input
          id="passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value);
            clearError();
          }}
          className={`mt-1 ${INPUT}`}
        />
      </div>
      <div>
        <label htmlFor="passphrase-confirm" className="text-xs text-on-surface-variant">
          Again
        </label>
        <input
          id="passphrase-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={mismatch}
          className={`mt-1 ${INPUT}`}
        />
        {mismatch && <p className="mt-1 text-xs text-error">These do not match.</p>}
      </div>

      <label className="flex cursor-pointer gap-2.5 rounded-lg border border-error/35 bg-error/5 p-3">
        <input
          type="checkbox"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
        />
        <span className="text-xs leading-5 text-on-surface-variant">
          I understand that Nexora cannot reset this passphrase or recover my synced data without it.
          Recovery codes are the only other way in, and I will save them.
        </span>
      </label>

      <button
        type="button"
        onClick={() => void completeSetup(passphrase)}
        disabled={!ready}
        className="pill h-10 w-full bg-primary text-sm text-on-primary disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Create the vault
      </button>

      {error && <ErrorLine>{error}</ErrorLine>}
    </Panel>
  );
}

function Locked() {
  const { unlock, email, busy, error, clearError, signOut } = useSync();
  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(true);

  const looksLikeCode = isRecoveryCode(secret);

  return (
    <Panel eyebrow="Locked" title="Unlock this device." icon={KeyRound}>
      <p className="text-sm leading-6 text-on-surface-variant">
        Signed in as <span className="text-on-surface">{email}</span>. Enter your passphrase, your
        password, or one recovery code. Asked once per device.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void unlock(secret, remember);
        }}
        className="space-y-3"
      >
        <div>
          <label htmlFor="unlock-secret" className="text-xs text-on-surface-variant">
            Passphrase or recovery code
          </label>
          <input
            id="unlock-secret"
            type={looksLikeCode ? "text" : "password"}
            required
            autoComplete="current-password"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value);
              clearError();
            }}
            className={`mt-1 ${INPUT} ${looksLikeCode ? "font-mono" : ""}`}
          />
          {looksLikeCode && (
            <p className="mt-1 text-xs text-on-surface-variant">
              That looks like a recovery code. It will still work after you use it.
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface-variant">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
          Trust this device, so it does not ask again
        </label>

        <button
          type="submit"
          disabled={busy || secret.length === 0}
          className="pill h-10 w-full bg-primary text-sm text-on-primary disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Unlock
        </button>
      </form>

      {error && <ErrorLine>{error}</ErrorLine>}

      <button
        type="button"
        onClick={() => void signOut()}
        className="cursor-pointer text-xs text-on-surface-variant underline-offset-2 hover:underline"
      >
        Sign out instead
      </button>
    </Panel>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.06] p-4">
      <h3 className="text-sm font-semibold text-on-surface">Save these recovery codes now.</h3>
      <p className="mt-1 text-xs leading-5 text-on-surface-variant">
        Each one opens your vault once your passphrase is gone, and they are shown this one time. Put
        them somewhere that is not this browser.
      </p>

      <ul className="mt-3 grid grid-cols-1 gap-1 font-mono text-[12px] text-on-surface sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="rounded border border-white/[0.08] bg-black/20 px-2 py-1">
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          }}
          className="press flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-outline-variant px-3 text-xs text-on-surface-variant hover:bg-white/[0.06]"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy all"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={!copied}
          className="pill h-9 bg-primary px-3 text-xs text-on-primary disabled:opacity-50"
        >
          I have saved them
        </button>
      </div>
    </div>
  );
}

function Unlocked() {
  const {
    email,
    lastSyncAt,
    lastSyncSummary,
    recipeBook,
    freshRecoveryCodes,
    dismissRecoveryCodes,
    syncNow,
    signOut,
    untrustDevice,
    purge,
    busy,
    error,
  } = useSync();
  const [confirmPurge, setConfirmPurge] = useState(false);

  return (
    <Panel eyebrow="Sync is on" title="Your recipes travel with you." icon={Cloud}>
      {freshRecoveryCodes && (
        <RecoveryCodes codes={freshRecoveryCodes} onDone={dismissRecoveryCodes} />
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Account", email ?? "unknown"],
          ["Recipes carried", `${recipeBook.length}`],
          [
            "Last sync",
            lastSyncAt ? new Date(lastSyncAt).toLocaleString("en-US") : "not yet",
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <dt className="text-[10.5px] uppercase tracking-wider text-on-surface-variant/70">
              {label}
            </dt>
            <dd className="mt-1 truncate text-[13px] text-on-surface">{value}</dd>
          </div>
        ))}
      </dl>

      {lastSyncSummary && (
        <p className="font-mono text-xs text-on-surface-variant">{lastSyncSummary}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={busy}
          className="pill h-9 bg-primary px-4 text-xs text-on-primary disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          Sync now
        </button>
        <button
          type="button"
          onClick={() => void untrustDevice()}
          className="press flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-outline-variant px-3 text-xs text-on-surface-variant hover:bg-white/[0.06]"
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          Forget this device
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="press flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-outline-variant px-3 text-xs text-on-surface-variant hover:bg-white/[0.06]"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign out
        </button>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      {/* This used to end "your datasets have not left this device at all",
          which is the opposite of what sync does: SYNCED_KINDS includes
          "dataset", so they are uploaded as sealed blobs. The reassuring part
          is true and worth saying; the last sentence was not. */}
      <Note>
        The server holds ciphertext and an opaque row id per record. It has never held your
        passphrase, your column names, or a single cell value. Your datasets are up there, sealed
        with a key it has never seen.
      </Note>

      <div className="rounded-lg border border-error/35 bg-error/5 p-3">
        {confirmPurge ? (
          <div className="space-y-2">
            <p className="text-xs leading-5 text-on-surface-variant">
              This deletes every synced record and your key ring from the server. Your local
              workspace is untouched, and other devices keep whatever they already pulled.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void purge();
                  setConfirmPurge(false);
                }}
                className="pill h-9 bg-error px-3 text-xs text-on-primary"
              >
                Delete it all
              </button>
              <button
                type="button"
                onClick={() => setConfirmPurge(false)}
                className="press h-9 cursor-pointer rounded-lg border border-outline-variant px-3 text-xs text-on-surface-variant"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmPurge(true)}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-error"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete everything from the server
          </button>
        )}
      </div>
    </Panel>
  );
}

export function AccountPanel() {
  const mounted = useMounted();
  const stage = useSync((s) => s.stage);
  const refresh = useSync((s) => s.refresh);

  useEffect(() => {
    if (mounted) void refresh();
  }, [mounted, refresh]);

  if (!mounted) {
    return (
      <section className="nexora-card p-5">
        <p className="font-mono text-xs text-on-surface-variant">Checking account status…</p>
      </section>
    );
  }

  switch (stage) {
    case "unconfigured":
      return <Unconfigured />;
    case "signedOut":
      return <SignedOut />;
    case "awaitingConfirmation":
      return <AwaitingConfirmation />;
    case "needsSetup":
      return <NeedsSetup />;
    case "locked":
      return <Locked />;
    case "unlocked":
      return <Unlocked />;
  }
}
