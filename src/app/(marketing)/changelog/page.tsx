import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, Section, Bullets } from "@/components/marketing/prose-page";

export const metadata: Metadata = {
  title: "Changelog · Nexora",
  description: "What shipped, and when. Entries start from the first published build.",
};

export default function ChangelogPage() {
  return (
    <ProsePage
      eyebrow="Changelog"
      title="What shipped"
      intro="This log starts with the current build. Earlier work happened in the repository's commit history rather than in release notes, and no entries have been back-dated to make the list look longer."
      updated="4 August 2026"
    >
      <Section title="4 August 2026 — Workflow release">
        <p>
          The workspace was reorganised around the order analysis actually happens in, and every
          claim on the marketing site was checked against the code.
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-white">Dataset picker.</strong> Opening the workspace no longer
              reopens whatever file you had last. The{" "}
              <Link href="/launch" className="text-primary hover:underline">Datasets</Link> screen
              lists what you have loaded with type, upload time, last modified, and a quick preview,
              and waits for you to choose.
            </>,
            <>
              <strong className="text-white">Dataset Doctor is its own page.</strong> The quality
              tools used to sit on a page labelled Dashboard, which is not what they are. Quality now
              lives at{" "}
              <Link href="/dataset-doctor" className="text-primary hover:underline">Dataset Doctor</Link>{" "}
              and covers only quality: health score, missing values, duplicates, outliers, type
              validation, and the fix for each.
            </>,
            <>
              <strong className="text-white">A real dashboard.</strong>{" "}
              <Link href="/dashboard" className="text-primary hover:underline">Dashboard</Link> now
              derives KPIs from what the columns mean rather than reporting row and column counts.
              Revenue, gross profit, margin, order value, distinct customers, conversion rate, and
              growth appear when the data supports them and are omitted when it does not, with
              period-over-period comparison against an equal-length window.
            </>,
            <>
              <strong className="text-white">Every chart is switchable.</strong> All eight chart types
              are offered on every panel, not just the first, with the unsuitable ones disabled and
              the reason on the button.
            </>,
            <>
              <strong className="text-white">Dashboard filters.</strong> A filter bar for the
              dimensions that make sense, plus click-to-cross-filter on any bar or slice, applied to
              every panel and KPI at once.
            </>,
            <>
              <strong className="text-white">Pivot Table.</strong> A new tool at{" "}
              <Link href="/pivot" className="text-primary hover:underline">Pivot</Link>: two fields
              crossed, five aggregations, totals both ways computed from source rows, CSV export.
            </>,
            <>
              <strong className="text-white">Reports gained the findings panel</strong> so the
              evidence behind each statement sits with the document it produced.
            </>,
            <>
              <strong className="text-white">Workspace search works.</strong> The search box in the
              top bar now finds pages, loaded datasets, and columns instead of being decorative.
            </>,
            <>
              <strong className="text-white">Marketing site rebuilt for accuracy.</strong> Invented
              testimonials removed, usage statistics replaced with product limits that can be checked
              in the source, the supported-source list cut down to what the parser actually reads,
              and every footer link pointed at a page that exists.
            </>,
          ]}
        />
      </Section>

      <Section title="How this log is kept">
        <p>
          One entry per shipped change set, dated, with links to the pages affected. Anything that
          changes the{" "}
          <Link href="/privacy" className="text-primary hover:underline">privacy policy</Link> or the{" "}
          <Link href="/terms" className="text-primary hover:underline">terms</Link> is noted here as
          well as on those pages. Commit-level history lives on{" "}
          <a
            href="https://github.com/Ghostiemoh/nexora/commits"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            GitHub
          </a>
          .
        </p>
      </Section>
    </ProsePage>
  );
}
