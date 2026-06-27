"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Book, ShieldAlert, FileText, Building } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export default function CatchAllPage({ params }: Props) {
  const { slug } = React.use(params);
  const path = slug.join("/");

  // Mapped mock contents
  let title = "Document Not Found";
  let subtitle = "The requested resource could not be found locally.";
  let Icon = FileText;
  let content = (
    <div className="space-y-4">
      <p>The path you navigated to does not have a static local page compiled.</p>
      <p>Please return to the landing page or launch the OS dashboard.</p>
    </div>
  );

  if (path === "privacy") {
    title = "Privacy & Security Protocol";
    subtitle = "Effective Date: June 13, 2026";
    Icon = ShieldAlert;
    content = (
      <div className="space-y-6 text-on-surface-variant leading-relaxed text-sm">
        <p>
          At Nexora, we design software with a strict privacy-first architecture. This Privacy &amp; Security Protocol details how your analytical datasets, database connection credentials, and local SQL operations are processed.
        </p>
        
        <h3 className="text-white font-bold text-base pt-4">1. Local-First Sandbox Processing</h3>
        <p>
          All operations performed within the Nexora workspace, including CSV profiling, Excel parsing, relational joining, and NLP AI chat commands, run 100% locally in your client browser. Datasets are loaded into in-memory RAM buffers or sandboxed client-side LocalStorage.
        </p>

        <h3 className="text-white font-bold text-base pt-4">2. Zero Server Ingestion</h3>
        <p>
          Nexora does not maintain back-end database stores or logging telemetry for user datasets. Your tabular values, schemas, and credentials are never uploaded to our servers or third-party storage centers.
        </p>

        <h3 className="text-white font-bold text-base pt-4">3. NLP AI Client Bounds</h3>
        <p>
          Conversations with the Axiom NLP engine are processed through static client-side parsing dictionaries and rule-based interpreters. We do not dispatch your database schemas to remote LLM hosting APIs.
        </p>
      </div>
    );
  } else if (path === "terms") {
    title = "Terms of Service";
    subtitle = "Revision: 2026.1";
    Icon = FileText;
    content = (
      <div className="space-y-6 text-on-surface-variant leading-relaxed text-sm">
        <p>
          Welcome to Nexora Analytics OS. By launching the sandbox, you agree to these Terms of Service.
        </p>
        
        <h3 className="text-white font-bold text-base pt-4">1. Scope of Agreement</h3>
        <p>
          Nexora provides client-side analytical software. Since the software executes locally inside your browser, you are solely responsible for maintaining backups of your CSV/Excel tables.
        </p>

        <h3 className="text-white font-bold text-base pt-4">2. No Database Liability</h3>
        <p>
          Nexora is provided &ldquo;as is&rdquo;. Connecting Nexora to database replica endpoints or production clusters is done at your own discretion and risk. Nexora is not liable for replica outages, bandwidth exhaustion, or data integrity drops.
        </p>

        <h3 className="text-white font-bold text-base pt-4">3. Prohibited Exploitation</h3>
        <p>
          You agree not to reverse-engineer the local sql-engine compiler or attempt to bypass storage size limit quotas implemented for browser performance.
        </p>
      </div>
    );
  } else if (path === "docs") {
    title = "OS Documentation";
    subtitle = "Developer guides and query specs";
    Icon = Book;
    content = (
      <div className="space-y-6 text-on-surface-variant leading-relaxed text-sm">
        <p>
          Learn how to utilize the local-first query engines and CSV profiling tools in Nexora OS.
        </p>

        <h3 className="text-white font-bold text-base pt-4">In-Memory SQL Dialect</h3>
        <p>
          Nexora executes an ANSI-92 compatible subset of SQL in the browser. Grouping operations, INNER, LEFT, RIGHT, and FULL joins are supported via client-side hash joins.
        </p>
        <pre className="bg-zinc-950 border border-white/5 p-4 rounded-xl font-mono text-[11px] text-zinc-300 overflow-x-auto shadow-inner">
          SELECT region, SUM(revenue) FROM active_dataset GROUP BY region;
        </pre>

        <h3 className="text-white font-bold text-base pt-4">Axiom NLP Syntax</h3>
        <p>
          The Axiom natural language bot matches semantic tokens to automatically build SQL statements. Use prompts like &ldquo;show columns with null values&rdquo; or &ldquo;join this with dataset X&rdquo;.
        </p>
      </div>
    );
  } else if (path === "company") {
    title = "About Nexora";
    subtitle = "The local-first analytics movement";
    Icon = Building;
    content = (
      <div className="space-y-6 text-on-surface-variant leading-relaxed text-sm">
        <p>
          Nexora was founded in 2026 with a simple mission: build high-speed analytics tools that prioritize developer privacy and browser-native performance.
        </p>
        
        <p>
          We believe analytics should not require complex cloud ingestion pipelines. By moving profiling, cleaning, and SQL query computation to the client-side, we deliver instantaneous results while guaranteeing 100% security sandbox isolation.
        </p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="max-w-4xl mx-auto px-6 py-20 select-none w-full"
    >
      {/* Back link */}
      <Link href="/" className="inline-flex items-center gap-2 text-primary hover:text-white text-xs font-mono uppercase tracking-wider mb-8 transition-colors active:scale-95 duration-200">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Home
      </Link>

      <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-8 md:p-10 backdrop-blur-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-8 relative z-10">
          {/* Header */}
          <div className="flex items-center gap-4 border-b border-white/5 pb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-[inset_0_1px_rgba(255,255,255,0.05)]">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
                {title}
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono mt-1 block uppercase tracking-wider">
                {subtitle}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="prose prose-invert max-w-none pt-2">
            {content}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
