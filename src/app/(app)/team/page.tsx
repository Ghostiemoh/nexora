"use client";

import { UserPlus, Shield, Mail, MoreHorizontal } from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { motion } from "framer-motion";

export default function TeamPage() {
  const mounted = useMounted();

  const members = [
    {
      name: "Muhammad",
      role: "Lead Architect",
      email: "muhammad@nexora.io",
      roleType: "Owner",
      initials: "MH",
      bgClass: "bg-primary/10 border-primary/20 text-primary",
    },
    {
      name: "Axiom Analyst",
      role: "AI Core Intelligence",
      email: "axiom@nexora.io",
      roleType: "Engine",
      initials: "AX",
      bgClass: "bg-tertiary/10 border-tertiary/20 text-tertiary",
    },
    {
      name: "Sarah Jenkins",
      role: "Database Administrator",
      email: "sarah.j@nexora.io",
      roleType: "Editor",
      initials: "SJ",
      bgClass: "bg-secondary/10 border-secondary/20 text-secondary",
    },
  ];

  if (!mounted) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="p-8 max-w-4xl mx-auto space-y-8 select-none"
    >
      {/* Title */}
      <div className="flex justify-between items-center border-b border-white/5 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight leading-tight mb-1">
            Team Management
          </h2>
          <p className="text-sm text-on-surface-variant">
            Manage database roles and analytical permissions for your organization.
          </p>
        </div>
        <button className="px-4 py-2.5 bg-primary text-black font-bold hover:bg-primary-fixed rounded-xl text-xs font-mono uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2 shadow-lg">
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {members.map((m) => (
          <div
            key={m.name}
            className="nexora-card p-6 flex items-start gap-4 hover:border-white/10 transition-all relative group backdrop-blur-md shadow-xl"
          >
            <div className={`w-12 h-12 rounded-full border flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-[inset_0_1px_rgba(255,255,255,0.05)] ${m.bgClass}`}>
              {m.initials}
            </div>
            
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex justify-between items-start">
                <div className="truncate">
                  <h4 className="text-sm font-bold text-white truncate tracking-tight">{m.name}</h4>
                  <span className="text-xs text-on-surface-variant block mt-0.5">
                    {m.role}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-mono text-[9px] uppercase tracking-wider font-bold shrink-0">
                  {m.roleType}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 text-xs font-mono text-zinc-500 pt-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  <span className="truncate">{m.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  <span>
                    {m.roleType === "Owner" || m.roleType === "Engine"
                      ? "Read/Write/Admin Access"
                      : "Read/Write Access"}
                  </span>
                </div>
              </div>
            </div>

            <button className="absolute top-4 right-4 text-on-surface-variant hover:text-white transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
