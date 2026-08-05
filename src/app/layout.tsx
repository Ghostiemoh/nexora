import type { Metadata } from "next";
import { MotionConfig } from "framer-motion";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexora-analytics.vercel.app";
const TITLE = "Nexora — Analytics OS";
const DESCRIPTION =
  "Clean a messy spreadsheet down to the cell, summarize it in a pivot, build the dashboard, and export it live to Power BI or Tableau. Runs entirely in your browser.";

export const metadata: Metadata = {
  /* Crawlers cannot resolve a relative image URL, so without a base the card
   * silently falls back to whatever favicon the scraper can find. This is what
   * makes the preview render at all. */
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Nexora" },
  description: DESCRIPTION,
  applicationName: "Nexora",
  keywords: [
    "data cleaning",
    "analytics",
    "pivot table",
    "dashboard",
    "Power BI export",
    "Tableau export",
    "spreadsheet",
    "local-first",
  ],
  openGraph: {
    type: "website",
    siteName: "Nexora",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark"
    >
      <body className="min-h-full flex flex-col bg-background text-on-surface select-none">
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}

