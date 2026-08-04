import React from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground relative">
      {/* Calm ambient wash: one soft periwinkle glow up top */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[600px] z-0"
        style={{
          background:
            "radial-gradient(60% 70% at 50% -10%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
        }}
        aria-hidden
      />

      <SiteHeader />

      {/* Content */}
      <main className="flex-1 flex flex-col relative z-10">{children}</main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
