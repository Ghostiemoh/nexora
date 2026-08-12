import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, Section, Bullets } from "@/components/marketing/prose-page";

export const metadata: Metadata = {
  title: "Privacy · Nexora",
  description: "What Nexora collects, which is close to nothing, and why.",
};

export default function PrivacyPage() {
  return (
    <ProsePage
      eyebrow="Privacy"
      title="Privacy policy"
      intro="Most privacy policies are long because the product collects a lot. This one is short for the opposite reason."
      updated="8 August 2026"
    >
      <Section title="What is collected">
        <p>
          No analytics script, no advertising pixel, no session recording, and no tracking cookie.
          Nexora does not measure what you do inside the workspace.
        </p>
        <p>
          Nexora runs no server of its own for the work you do with files. Opening a CSV, profiling
          it, cleaning it, pivoting it, querying it in SQL Lab, and charting it all happen inside
          this browser tab, so those files are never uploaded anywhere.
        </p>
      </Section>

      <Section title="The three times data does leave">
        <p>
          Saying &ldquo;nothing ever leaves your device&rdquo; would be simpler, and it would be
          wrong. Three features send data out. All three are things you switch on yourself, and none
          of them run in the background.
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-white">Database connections.</strong> A browser cannot open a
              PostgreSQL or MySQL socket, so Nexora&apos;s API does it. When you test a connection or
              import a table, your connection string and your SQL are sent to that API, and the rows
              come back through it. Nexora does not store either one, but they are held in server
              memory for the length of the request, and request logs at our hosting provider are
              outside our control. Use a read-only database user.
            </>,
            <>
              <strong className="text-white">The AI analyst.</strong> If you add your own Google
              Gemini key in Settings, questions go from your browser straight to Google, never
              through us. What travels with them is your column names and statistics, the most
              common values in each column, and the first five rows of the dataset. Those are real
              values from your data. Google&apos;s API terms govern what happens to them, and free
              API tiers in particular may retain prompts. Without a key, the analyst falls back to
              the rule-based engine that runs locally and sends nothing.
            </>,
            <>
              <strong className="text-white">Sync.</strong> Opt-in, off until you sign in, and
              encrypted on this device before anything is sent. The section below is the detail.
            </>,
          ]}
        />
      </Section>

      <Section title="If you turn on sync">
        <p>
          Sync is opt-in and off until you sign in from Settings. Turning it on creates an account and
          means Nexora holds something on your behalf, so here is exactly what.
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-white">What is stored, and in what form.</strong> Three things
              and no others: your datasets, your cleaning recipes, and your workspace roster. Each is
              encrypted on your device with AES-256-GCM before it is sent. The server receives
              ciphertext, a row identifier that is an HMAC rather than a name, and a timestamp. It
              never receives a column name, a cell value, or the name of the record a row belongs to.
            </>,
            <>
              <strong className="text-white">What sync never carries.</strong> Your database
              connection strings. Your Gemini API key. Your export history, AI chat transcripts, and
              audit log. None of these has a code path into the sync payload, and a test in the
              repository fails the build if one is ever added. Read that as a statement about sync
              specifically: connection strings still reach the query API when you import a table,
              as described above.
            </>,
            <>
              <strong className="text-white">What is sent, once you sign in.</strong> Your datasets,
              compressed and sealed on this device before they leave it, stored as bytes the server
              has no key to open. Signing in is the only thing that starts this. Until then no
              dataset has anywhere to go.
            </>,
            <>
              <strong className="text-white">Why we cannot read any of it.</strong> The key that
              decrypts your records is derived on your device from your passphrase and never
              transmitted. When you sign in with email and password, the password is put through key
              derivation twice under different context strings: one result is what the auth provider
              stores and checks, the other never leaves your device. Holding the first reveals nothing
              about the second.
            </>,
            <>
              <strong className="text-white">What the account itself records.</strong> Your email
              address, and the sign-in timestamps any auth system keeps. If you sign in with Google,
              Google also learns that you signed in to Nexora.
            </>,
          ]}
        />
        <p>
          The consequence of this design is worth stating plainly: if you lose your passphrase and
          your recovery codes, we cannot recover your synced records. There is no master key, no
          reset, and no support route around it.
        </p>
      </Section>

      <Section title="What is stored on your device">
        <p>
          Everything you do lives in your own browser&apos;s local storage: datasets, cleaning
          recipes, pinned charts, the audit log, workspace members, support tickets, and your Gemini
          API key if you set one. It stays on your device and is readable only by this site in this
          browser profile.
        </p>
        <p>
          If you trust a device during unlock, an unextractable key is also kept in that
          browser&apos;s IndexedDB so it does not ask again. &ldquo;Forget this device&rdquo; in
          Settings removes it.
        </p>
        <p>
          Clearing your browser&apos;s site data removes all of it. If sync is off, there is no copy
          anywhere else to delete. If it is on, &ldquo;Delete everything from the server&rdquo; in
          Settings erases your records and your key ring outright.
        </p>
      </Section>

      <Section title="The other outbound requests">
        <Bullets
          items={[
            <>
              <strong className="text-white">Database queries.</strong> If you add a PostgreSQL or
              MySQL connection, your connection string and query are sent to this application&apos;s
              own read-only API route so it can execute them; a browser cannot open a database socket
              directly. Nothing is retained after the response is returned.
            </>,
            <>
              <strong className="text-white">AI features.</strong> If you add a Google Gemini API key,
              chat and English-to-SQL call Google&apos;s API directly from your browser using your
              key. Google&apos;s handling of those requests is governed by their terms, not ours.
              Only schema, column statistics, and a few sample rows are sent.
            </>,
          ]}
        />
        <p>
          Both are opt-in and neither happens unless you configure it. The{" "}
          <Link href="/security" className="text-primary hover:underline">security page</Link>{" "}
          describes each in more detail.
        </p>
      </Section>

      <Section title="Hosting">
        <p>
          The site itself is served as static assets. Whoever hosts a given deployment may keep
          ordinary web server logs, such as IP address and user agent, as any web server does. That
          is outside Nexora&apos;s control and is not linked to anything you do inside the workspace,
          because the workspace does not report back.
        </p>
      </Section>

      <Section title="Your rights over what is held">
        <p>
          With sync off, Nexora holds no personal data about you, so rights of access, correction, and
          erasure have nothing to act on: the only copy of your data is the one already in your hands.
        </p>
        <p>
          With sync on, the personal data held is your email address and a set of encrypted records.
          Access and erasure are both self-service from Settings, immediately and without asking
          anyone: &ldquo;Delete everything from the server&rdquo; removes the records and the key ring.
          Correction of the records means editing them in the workspace and syncing again. We cannot
          correct their contents for you, because we cannot read them.
        </p>
        <p>
          Nexora is not directed at children, and an account requires an email address you control.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy ever changes, the change will appear in the{" "}
          <Link href="/changelog" className="text-primary hover:underline">changelog</Link> along
          with everything else, and the date at the top of this page will move.
        </p>
      </Section>
    </ProsePage>
  );
}
