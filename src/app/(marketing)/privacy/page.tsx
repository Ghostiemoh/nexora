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
      updated="4 August 2026"
    >
      <Section title="What is collected">
        <p>
          Nothing. There is no account system, no analytics script, no advertising pixel, no session
          recording, and no cookie set by Nexora. Your files are never uploaded, because there is no
          endpoint to upload them to.
        </p>
      </Section>

      <Section title="What is stored, and where">
        <p>
          Everything you do lives in your own browser&apos;s local storage: datasets, cleaning
          recipes, pinned charts, the audit log, workspace members, support tickets, and your Gemini
          API key if you set one. It stays on your device and is readable only by this site in this
          browser profile.
        </p>
        <p>
          Clearing your browser&apos;s site data removes all of it. There is no copy anywhere else to
          delete, and no request to make of anyone.
        </p>
      </Section>

      <Section title="The two outbound requests">
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

      <Section title="Children and jurisdiction">
        <p>
          Nexora is a general-purpose tool with no accounts and no data collection, so it holds no
          personal data about anyone, of any age, in any jurisdiction. Where local law grants you
          rights of access, correction, or erasure over personal data, those rights have nothing to
          act on here: the only copy of your data is the one already in your hands.
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
