import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNavbar } from "@/components/layout/top-navbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background relative">
      {/* Calm ambient wash */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[70vw] h-[34vh] pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 80% at 50% 0%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)",
        }}
        aria-hidden
      />

      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TopNavbar />
        <div className="no-print">
          <Breadcrumbs />
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
