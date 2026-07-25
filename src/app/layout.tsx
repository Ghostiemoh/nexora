import type { Metadata } from "next";
import { MotionConfig } from "framer-motion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexora Analytics OS",
  description: "Precision data intelligence, cleaning, and SQL lab sandbox running local-first in your browser.",
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

