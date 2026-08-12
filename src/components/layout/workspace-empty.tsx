"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FolderOpen, type LucideIcon } from "lucide-react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** The one empty state every workspace page shows when no dataset is active.
 *  It never offers an upload box of its own: choosing data happens in one
 *  place, so the workspace cannot end up with two different front doors. */
export function WorkspaceEmpty({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="mx-auto flex min-h-[70vh] max-w-[1100px] flex-col items-center justify-center p-6"
    >
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">{body}</p>
        </div>
        <Link href="/launch" className="pill mx-auto h-11 bg-primary px-5 text-[14px] text-on-primary">
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          Choose a dataset
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <p className="text-[11px] text-on-surface-variant/70">
          Runs on this device. Nothing is uploaded unless you sign in to sync.
        </p>
      </div>
    </motion.div>
  );
}
