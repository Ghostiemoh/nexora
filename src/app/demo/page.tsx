"use client";

import { HeroSection } from "@/components/ui/hero-section-shadcnui";

export default function DemoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 relative overflow-hidden">
      {/* Background radial soft light for depth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none z-0" />
      <div className="relative z-10 w-full max-w-5xl">
        <HeroSection />
      </div>
    </div>
  );
}
