"use client";

import { useEffect, useState } from "react";

export interface SectionLink {
  id: string;
  label: string;
}

/** A sticky index for a long page. The active chip follows the section you are
 *  actually looking at, so the page never feels like an unmarked scroll. */
export function SectionNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    // Top-biased root margin: a section counts as current once its heading
    // reaches the upper third, which is where people read from.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-8% 0px -70% 0px", threshold: 0 }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Sections on this page"
      /* Opaque, not translucent: a sticky bar that content can be read through
         looks like the section beneath it is overlapping. */
      className="no-print sticky top-2 z-30 -mx-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-surface-container px-1.5 py-1.5 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.9)]"
    >
      <ul className="flex w-max items-center gap-1">
        {sections.map((section) => {
          const isActive = active === section.id;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`press block whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-on-surface-variant hover:bg-white/[0.05] hover:text-on-surface"
                }`}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
