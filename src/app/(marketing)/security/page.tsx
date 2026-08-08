import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, Section, Bullets, Facts } from "@/components/marketing/prose-page";

export const metadata: Metadata = {
  title: "Security · Nexora",
  description:
    "What runs locally, the two cases where data leaves your device, and the limits of a browser-based tool.",
};

export default function SecurityPage() {
  return (
    <ProsePage
      eyebrow="Security"
      title="What leaves your device, precisely"
      intro="Nexora's main claim is that your data stays with you. That claim is worth nothing without the exceptions spelled out, so here they are."
      updated="4 August 2026"
    >
      <Section title="What runs entirely in your browser">
        <Bullets
          items={[
            "Parsing CSV, TSV, TXT, JSON, and Excel files.",
            "Profiling: types, completeness, uniqueness, quartiles, outlier fences, date ranges, value frequencies.",
            "Every cleaning operation, along with undo and recipe replay.",
            "The SQL engine, the pivot engine, chart building, and KPI calculation.",
            "OCR of images and PDF text extraction, using Tesseract and pdf.js in the tab.",
            "Report generation and every export: PDF, Word, Markdown, CSV, and Excel.",
          ]}
        />
        <p>
          There is no upload endpoint for your files. This is why the workspace opens with no
          account: analysis needs one no more than a spreadsheet does. Sync, if you turn it on, sends
          your recipes and nothing else, encrypted before they leave.
        </p>
      </Section>

      <Section title="The two exceptions">
        <Facts
          rows={[
            {
              term: "Database connections",
              detail:
                "A browser cannot open a PostgreSQL or MySQL socket, so those queries pass through this application's own API route on the server that hosts it. Your connection string and query are sent there, executed, and the rows are returned. Nothing is stored server-side. The route enforces read-only: single statements beginning with SELECT, WITH, SHOW, DESCRIBE, or EXPLAIN, with write and DDL keywords rejected. Comments are stripped first so keywords cannot hide in them.",
            },
            {
              term: "AI features",
              detail:
                "If you add a Google Gemini API key in Settings, chat and English-to-SQL call Google directly from your browser. Only the schema, column statistics, and a few sample rows are sent, never the full dataset. Without a key these features stay off and everything else still works.",
            },
          ]}
        />
      </Section>

      <Section title="Where state is kept">
        <p>
          Datasets, cleaning recipes, pinned charts, the audit log, workspace members, and your API
          key live in this browser&apos;s local storage, under one key. Anything above roughly 3.5 MB
          is held in memory for the session instead, so a large file does not blow the storage quota.
        </p>
        <p>
          The practical consequence: anyone with access to your browser profile has access to what is
          in the workspace. On a shared machine, remove datasets when you are done, or use a private
          window so nothing persists.
        </p>
      </Section>

      <Section title="Sync, if you turn it on">
        <p>
          Sync is off until you sign in from Settings. It carries your cleaning recipes and workspace
          roster so they follow you between devices. It does not carry your datasets.
        </p>
        <Facts
          rows={[
            {
              term: "What the server can see",
              detail:
                "AES-256-GCM ciphertext, a row id that is an HMAC rather than a name, a byte length, and a timestamp. Nothing else is stored against a record.",
            },
            {
              term: "Why it cannot decrypt",
              detail:
                "The data key is random, generated on your device, and stored only in wrapped form. Its unwrapping key is derived from your passphrase locally and never transmitted. With email and password sign-in, the password is derived twice under different context strings: one result is what the auth provider checks, the other never leaves the device.",
            },
            {
              term: "Why the row ids leak nothing",
              detail:
                "A record id is an HMAC computed under a key derived from your data key, so it is identical across your own devices and meaningless to anyone else, including us.",
            },
            {
              term: "Device trust",
              detail:
                "After an unlock you can trust the device, which wraps the data key under a non-extractable key in IndexedDB. Page script can ask it to unwrap but cannot read it, and neither can anything reading the database file. Forget this device in Settings withdraws it.",
            },
            {
              term: "What is deliberately excluded",
              detail:
                "Datasets, database connection strings, your Gemini API key, export history, AI chat transcripts, and the audit log. These have no code path to the server, and a test in the repository fails the build if one is added.",
            },
          ]}
        />
        <p>
          The cost of this design, stated plainly: lose both your passphrase and your recovery codes
          and your synced records are unrecoverable. There is no master key and no reset.
        </p>
      </Section>

      <Section title="What this does not protect against">
        <p>
          Being honest about the boundary matters more than the claim itself.
        </p>
        <Bullets
          items={[
            "A compromised browser, a malicious extension with page access, or a compromised machine can read anything the page can read. That includes your data key while the workspace is unlocked.",
            "Local storage is not encrypted. Your Gemini API key sits there in plain text, as it does in most browser tools that hold one.",
            "Exports leave the sandbox the moment you save them. Where the file goes next is on you.",
            "A connection string typed into Data Sources is sent to the API route on every query. Use a read-only database role.",
            "With sync on, the server learns how many records you keep, how large each is, and when you touch them. Encryption hides contents, not the shape of the traffic.",
            "Signing in with Google tells Google that you use Nexora.",
          ]}
        />
      </Section>

      <Section title="Reporting a problem">
        <p>
          If you find a security issue, open an issue on{" "}
          <a
            href="https://github.com/Ghostiemoh/nexora/issues"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            the GitHub repository
          </a>
          . If the issue is sensitive, say so in the title without the details and a private channel
          will be arranged. See also the{" "}
          <Link href="/privacy" className="text-primary hover:underline">privacy page</Link>.
        </p>
      </Section>
    </ProsePage>
  );
}
