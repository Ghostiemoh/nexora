"use client";

/* The account page, in both modes.
 *
 * Nexora's sign-in is unusual in a way the design has to carry: it is not a
 * gate. Nothing behind it is locked, because every feature runs in the browser
 * without an account. All an account does is move work between devices. A page
 * that looked like a normal login wall would therefore be lying by layout, so
 * "Continue without an account" is a real control at the end of the form, not
 * a grey link in the corner.
 *
 * The second unusual thing is that the password is unrecoverable by design.
 * Each one is put through key derivation twice under different context
 * strings: one result is what the auth provider checks, the other never leaves
 * the device and is the only thing that decrypts the vault. So there is no
 * password reset to offer, and the page says so before the field rather than
 * after the disaster.
 *
 * Stages past sign-in (confirm your email, mint the vault, unlock this device)
 * are delegated to AccountPanel. That code already handles recovery codes and
 * key wrapping, and a second implementation of a security flow is a second
 * chance to get it wrong. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CloudOff,
  Loader2,
  Lock,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";
import { useSync } from "@/lib/sync-store";
import { useMounted } from "@/lib/use-mounted";
import { checkPassword, passwordMeetsPolicy, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { AccountPanel } from "@/components/account-panel";
import { authView, AUTH_COPY, SKIP_DESTINATION, type AuthMode } from "@/lib/auth-view";

const INPUT =
  "h-11 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/50 focus-visible:border-primary";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-5xl">{children}</div>;
}

/** The card the form sits in, and the explanation beside it. */
function Split({ form, aside }: { form: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="nexora-card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="p-6 sm:p-8 lg:p-10">{form}</div>
      {/* Second in the DOM as well as on screen: a screen reader should meet
          the thing it can act on before the thing that explains it. */}
      <aside className="border-t border-white/[0.07] bg-white/[0.02] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
        {aside}
      </aside>
    </div>
  );
}

function Point({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Lock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-on-surface">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-on-surface-variant">{children}</p>
      </div>
    </li>
  );
}

/** The escape hatch, styled as an option rather than an apology. */
function SkipRow() {
  return (
    <div className="mt-7 border-t border-white/[0.07] pt-6">
      <p className="text-[12.5px] leading-relaxed text-on-surface-variant">
        Every feature works without an account. Skipping this loses nothing except sync between
        devices, and you can sign in later from Settings.
      </p>
      <Link
        href={SKIP_DESTINATION}
        className="press mt-3 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-outline-variant text-sm font-medium text-on-surface transition-colors hover:bg-white/[0.06]"
      >
        Continue without an account
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function Aside({ mode }: { mode: AuthMode }) {
  return (
    <>
      <p className="text-label text-primary">
        {mode === "up" ? "Before you start" : "What an account does"}
      </p>
      <ul className="mt-5 space-y-5">
        <Point icon={MonitorSmartphone} title="It moves your work, and only that">
          Datasets, cleaning recipes, and your workspace roster travel between the devices you sign
          in on. Your API keys, database connection strings, chat history, and audit log are never
          part of it.
        </Point>
        <Point icon={Lock} title="It is sealed before it leaves">
          Records are encrypted on this device with AES-256-GCM. The server receives ciphertext, an
          identifier that is a hash rather than a name, and a timestamp. It never sees a column name
          or a cell value.
        </Point>
        <Point icon={ShieldCheck} title="There is no password reset">
          Your password is derived twice under different context strings. One result signs you in.
          The other never leaves this device and is the only thing that decrypts your data, which
          means nobody at Nexora can recover it for you. Recovery codes come next, and they are the
          only other way in.
        </Point>
      </ul>

      <p className="mt-6 border-t border-white/[0.07] pt-5 text-[12px] leading-relaxed text-on-surface-variant/80">
        Two features reach the network whether or not you have an account, because they cannot work
        otherwise: importing from a database, and the AI analyst. Both say so where you use them.
      </p>
    </>
  );
}

function Form({ mode }: { mode: AuthMode }) {
  const {
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    busy,
    error,
    clearError,
    googleAvailable,
  } = useSync();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const copy = AUTH_COPY[mode];
  const rules = checkPassword(password);

  /* The policy is enforced only when creating an account. An existing password
   * that predates these rules still has to be typeable, or the rules would
   * lock people out of their own vaults instead of strengthening anything. */
  const passwordOk = mode === "in" || passwordMeetsPolicy(password);
  const canSubmit = !busy && passwordOk && (mode === "in" || acknowledged);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (mode === "in") void signInWithPassword(email.trim(), password);
    else void signUpWithPassword(email.trim(), password);
  };

  return (
    <>
      <h1 className="text-[26px] font-semibold tracking-tight text-on-surface sm:text-[30px]">
        {copy.title}
      </h1>
      <p className="mt-2.5 max-w-md text-[13.5px] leading-relaxed text-on-surface-variant">
        {copy.lede}
      </p>

      {googleAvailable === true && (
        <>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={busy}
            className="press mt-7 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container text-sm font-medium text-on-surface transition-colors hover:bg-white/[0.06] disabled:opacity-60"
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
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-outline-variant" />
            <span className="text-[11px] uppercase tracking-wider text-on-surface-variant/70">
              or
            </span>
            <span className="h-px flex-1 bg-outline-variant" />
          </div>
        </>
      )}

      <form onSubmit={submit} className={`space-y-4 ${googleAvailable === true ? "" : "mt-7"}`}>
        <div>
          <label htmlFor="auth-email" className="text-[12px] font-medium text-on-surface-variant">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearError();
            }}
            className={`mt-1.5 ${INPUT}`}
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="text-[12px] font-medium text-on-surface-variant">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={mode === "up" ? PASSWORD_MIN_LENGTH : undefined}
            aria-describedby={mode === "up" ? "auth-password-rules" : undefined}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            className={`mt-1.5 ${INPUT}`}
          />

          {/* Every rule shown at once, met or not. Revealing them one rejection
              at a time is how a reader ends up guessing at a target.

              Wrapping rather than a grid: three equal columns force the symbol
              rule to break mid-phrase and drop its second line under a
              checkmark still aligned to the first, which reads as a rendering
              fault. Letting each rule take its own width wraps the group
              instead of the sentence. */}
          {mode === "up" && (
            <ul id="auth-password-rules" className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={`flex items-start gap-1.5 text-[11px] transition-colors ${
                    rule.met ? "text-primary" : "text-on-surface-variant/70"
                  }`}
                >
                  {rule.met ? (
                    <Check className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="mt-[3px] h-3 w-3 shrink-0 rounded-full border border-current opacity-40"
                    />
                  )}
                  <span>{rule.label}</span>
                  <span className="sr-only">{rule.met ? " met" : " not met yet"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Asked before the account exists, not after the data is gone. */}
        {mode === "up" && (
          <label className="flex cursor-pointer gap-2.5 rounded-lg border border-error/30 bg-error/[0.06] p-3.5">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
            />
            <span className="text-[12px] leading-5 text-on-surface-variant">
              I understand this password cannot be reset. If I lose it and my recovery codes, my
              synced data cannot be decrypted by anyone, including Nexora.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="pill h-11 w-full bg-primary text-sm text-on-primary disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {copy.submit}
        </button>

        {error && (
          <p role="alert" className="flex gap-2 text-[12.5px] leading-5 text-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </form>

      <p className="mt-5 text-[12.5px] text-on-surface-variant">
        {copy.switchPrompt}{" "}
        <Link href={copy.switchHref} className="cursor-pointer text-primary hover:underline">
          {copy.switchAction}
        </Link>
        .
      </p>

      <SkipRow />
    </>
  );
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const mounted = useMounted();
  const router = useRouter();
  const stage = useSync((s) => s.stage);
  const refresh = useSync((s) => s.refresh);

  useEffect(() => {
    if (mounted) void refresh();
  }, [mounted, refresh]);

  const view = mounted ? authView(stage) : null;

  /* Already signed in and unlocked: there is nothing on this page to do, and
     leaving a dead form up invites someone to sign in on top of themselves. */
  useEffect(() => {
    if (view === "done") router.replace("/settings");
  }, [view, router]);

  if (!mounted) {
    return (
      <Shell>
        <div className="nexora-card p-10">
          <p className="font-mono text-xs text-on-surface-variant">Checking account status…</p>
        </div>
      </Shell>
    );
  }

  if (view === "unavailable") {
    return (
      <Shell>
        <div className="nexora-card mx-auto max-w-lg p-8 sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <CloudOff className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-on-surface">
            Sync is not available here
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-on-surface-variant">
            This deployment is running without server credentials, so there is no account to create
            and nothing to sign into. Rather than show you a form that cannot succeed, here is the
            way in that works.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-on-surface-variant">
            Everything else behaves exactly as it would with sync configured. Nothing is missing from
            the workspace itself.
          </p>
          <Link
            href={SKIP_DESTINATION}
            className="pill mt-7 h-11 w-full bg-primary text-sm text-on-primary"
          >
            Open the workspace
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <p className="mt-5 border-t border-white/[0.07] pt-4 text-[11.5px] leading-relaxed text-on-surface-variant/80">
            Self-hosting? Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then apply{" "}
            <code className="font-mono">supabase/migrations</code>.
          </p>
        </div>
      </Shell>
    );
  }

  /* Confirming an email, minting a vault, or unlocking a device. AccountPanel
     owns these already, including the recovery codes, so it renders here in
     place of a second copy of the same security flow. */
  if (view === "continue" || view === "done") {
    return (
      <Shell>
        <div className="mx-auto max-w-xl">
          <AccountPanel />
          <p className="mt-4 px-1 text-center text-[12.5px] text-on-surface-variant">
            <Link href={SKIP_DESTINATION} className="cursor-pointer text-primary hover:underline">
              Skip for now
            </Link>{" "}
            and keep working on this device. Your account waits where it is.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Split form={<Form mode={mode} />} aside={<Aside mode={mode} />} />
    </Shell>
  );
}
