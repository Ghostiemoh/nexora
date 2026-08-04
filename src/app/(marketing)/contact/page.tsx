import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, Section, Facts } from "@/components/marketing/prose-page";

export const metadata: Metadata = {
  title: "Contact · Nexora",
  description: "How to report a bug, request a feature, or ask a question about Nexora.",
};

export default function ContactPage() {
  return (
    <ProsePage
      eyebrow="Contact"
      title="How to reach the person who builds this"
      intro="There is no contact form on this page. A form needs a server to receive it, and Nexora does not have one, so a form here would be a box that swallows what you type."
      updated="4 August 2026"
    >
      <Section title="Where to write">
        <Facts
          rows={[
            {
              term: "Bugs and feature requests",
              detail: (
                <>
                  Open an issue on{" "}
                  <a
                    href="https://github.com/Ghostiemoh/nexora/issues"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    GitHub
                  </a>
                  . This is the fastest route and the one that leaves a trail other people can find.
                </>
              ),
            },
            {
              term: "Security issues",
              detail: (
                <>
                  Also GitHub, but read the{" "}
                  <Link href="/security" className="text-primary hover:underline">security page</Link>{" "}
                  first for what to include and how to raise something sensitive.
                </>
              ),
            },
            {
              term: "Everything else",
              detail: (
                <>
                  The{" "}
                  <a
                    href="https://github.com/Ghostiemoh/nexora/discussions"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    discussions board
                  </a>{" "}
                  on the same repository.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="Before you write about a bug">
        <p>
          Two things make a report immediately actionable: the shape of the file that caused it
          (column names and types, roughly how many rows) and what you expected instead of what you
          saw. You do not need to send the file, and please do not, since it may hold data you are
          not free to share.
        </p>
        <p>
          If the problem is with a specific dataset, the{" "}
          <Link href="/history" className="text-primary hover:underline">History &amp; Audit</Link>{" "}
          page inside the workspace lists every action taken on it in order, which usually pins down
          the step that went wrong.
        </p>
      </Section>

      <Section title="The support desk inside the app">
        <p>
          The{" "}
          <Link href="/support" className="text-primary hover:underline">Support Desk</Link> in the
          workspace tracks issues locally in your browser so you can keep notes as you work. It is a
          personal tracker, not a ticket queue that reaches anyone. To be heard, use GitHub.
        </p>
      </Section>
    </ProsePage>
  );
}
