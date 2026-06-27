"use client";

import React, { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  type Variants,
} from "framer-motion";

/* Apple-grade spring. Emil: easier to reason about with duration + bounce. */
export const SPRING = { type: "spring", stiffness: 140, damping: 24, mass: 1 } as const;
export const SOFT = { type: "spring", stiffness: 90, damping: 20, mass: 1 } as const;

/* Strong ease-out curve — the CSS built-ins are too weak. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

/* ─── Reveal: fade + rise on scroll-in, spring settle ─── */
export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

/* Stagger container + child (Emil: 30-80ms between items). */
export const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE_OUT } },
};

/* ─── HeroLift: device scales/lifts as you scroll past it ─── */
export function HeroLift({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end start"],
  });
  const scaleRaw = useTransform(scrollYProgress, [0, 0.5], [0.94, 1]);
  const yRaw = useTransform(scrollYProgress, [0, 1], [40, -60]);
  const scale = useSpring(scaleRaw, { stiffness: 120, damping: 30 });
  const y = useSpring(yRaw, { stiffness: 120, damping: 30 });

  return (
    <div ref={ref} className={className} style={{ perspective: 1400 }}>
      <motion.div style={reduced ? undefined : { scale, y }}>{children}</motion.div>
    </div>
  );
}

/* ─── Magnetic: cursor pull with spring momentum (decorative) ─── */
export function Magnetic({
  children,
  strength = 0.3,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 200, damping: 15 });
  const y = useSpring(0, { stiffness: 200, damping: 15 });

  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className={className}
      onMouseMove={(e) => {
        if (reduced || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Count up on view (tabular, no layout shift) ─── */
export function Counter({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = React.useState(reduced ? to : 0);
  const started = useRef(false);

  React.useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const dur = 1300;
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(to * eased);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, reduced]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {val.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
