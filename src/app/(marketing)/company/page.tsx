import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, Section, Bullets } from "@/components/marketing/prose-page";

export const metadata: Metadata = {
  title: "About · Nexora",
  description: "Why Nexora exists, who builds it, and what it will not become.",
};

export default function CompanyPage() {
  return (
    <ProsePage
      eyebrow="About"
      title="An analytics tool that stays on your machine"
      intro="Nexora is an independent project, not a company with a sales team. This page says who builds it and what it is for, without dressing either up."
      updated="4 August 2026"
    >
      <Section title="Why it exists">
        <p>
          Most analysis starts the same way: a file arrives, and before anything useful can be said
          about it, somebody has to find out how broken it is. Blank cells, duplicated rows, dates
          that are secretly serial numbers, a region column with four spellings of the same region.
          That work is unglamorous, it is repeated on every file, and it is where the errors that
          reach a slide deck are born.
        </p>
        <p>
          The tools that automate it usually want your data on their servers first. For a lot of
          data, particularly anything covered by a contract, that is where the conversation stops.
          Nexora exists to close that gap: the same profiling, cleaning, charting, and reporting, run
          inside the tab, with no upload to approve.
        </p>
      </Section>

      <Section title="Who builds it">
        <p>
          Nexora is built and maintained by Muhammad Auwal Abdulaziz, a data and on-chain analyst
          working in Nigeria. It is a solo project. There is no team page here because there is no
          team, and inventing one would be the first dishonest thing on this site.
        </p>
        <p>
          The source is on{" "}
          <a
            href="https://github.com/Ghostiemoh/nexora"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            GitHub
          </a>
          , which is also the fastest way to raise a bug or ask for something.
        </p>
      </Section>

      <Section title="How it is built">
        <Bullets
          items={[
            "The analysis engine is plain TypeScript with no framework in it: profiling, cleaning, SQL, chart selection, KPI derivation, pivots, and report writing are all pure functions, unit-tested, and independent of the interface.",
            "That separation is the point. The rules that decide what counts as an outlier, or which chart fits a pair of columns, are readable and testable rather than buried in a component.",
            "The interface is Next.js and React, with Recharts for the visuals and Zustand holding the workspace state in local storage.",
            "There is no backend beyond one read-only route that proxies database queries, because browsers cannot open database sockets.",
          ]}
        />
      </Section>

      <Section title="What it will not become">
        <p>
          Some decisions are worth committing to in public, because they are the ones that get
          quietly reversed once a product needs revenue.
        </p>
        <Bullets
          items={[
            "No paid tier, and no feature held back to create one. Nothing here costs money to run, so nothing here needs to charge.",
            "No telemetry. Not anonymous usage counts, not crash reporting, not a pixel.",
            "No file upload. The moment your data has to reach a server to be analyzed, the reason to use this instead of something else is gone.",
            "No invented social proof. There are no testimonials on this site because there are no customers to quote. If that ever changes, the quotes will be real and attributable.",
          ]}
        />
      </Section>

      <Section title="Get in touch">
        <p>
          Bug reports, feature requests, and questions all belong on{" "}
          <Link href="/contact" className="text-primary hover:underline">the contact page</Link>. If
          you want to see what the tool does before reading another word about it, the{" "}
          <Link href="/launch" className="text-primary hover:underline">workspace</Link> takes a file
          straight away.
        </p>
      </Section>
    </ProsePage>
  );
}
