"use client";

import { useState } from "react";
import { UserPlus, Shield, Mail, Trash2, X } from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { useNexora } from "@/lib/store";
import { WorkspaceBundleCard } from "@/components/workspace-bundle";
import { motion, AnimatePresence } from "framer-motion";
import { MODAL_BACKDROP } from "@/components/layout/layers";

export default function TeamPage() {
  const mounted = useMounted();
  
  const teamMembers = useNexora((s) => s.teamMembers);
  const addTeamMember = useNexora((s) => s.addTeamMember);
  const removeTeamMember = useNexora((s) => s.removeTeamMember);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    email: "",
    roleType: "Editor",
  });

  if (!mounted) {
    return (
      <div className="p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-on-surface-variant font-mono text-xs">Loading organization directory…</div>
      </div>
    );
  }

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.role) return;
    addTeamMember(formData);
    setFormData({ name: "", role: "", email: "", roleType: "Editor" });
    setIsInviteOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="p-8 max-w-4xl mx-auto space-y-8 select-none"
    >
      {/* Header */}
      <div className="flex justify-between items-center border-b border-white/5 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight leading-tight mb-1">
            Team Management
          </h2>
          <p className="text-sm text-on-surface-variant">
            Manage database roles and analytical permissions for your organization.
          </p>
        </div>
        <button
          onClick={() => setIsInviteOpen(true)}
          className="pill h-10 px-4 bg-primary text-on-primary text-[13px] hover:bg-primary-fixed transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer flex items-center gap-2 shadow-lg"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {teamMembers.map((m) => (
          <div
            key={m.id}
            className="nexora-card p-6 flex items-start gap-4 hover:border-white/10 transition-[color,background-color,border-color,box-shadow,transform,opacity] relative group backdrop-blur-md shadow-xl"
          >
            <div
              className={`w-12 h-12 rounded-full border flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-[inset_0_1px_rgba(255,255,255,0.05)] ${m.bgClass}`}
            >
              {m.initials}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex justify-between items-start">
                <div className="truncate pr-6">
                  <h4 className="text-sm font-bold text-white truncate tracking-tight">
                    {m.name}
                  </h4>
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

            {m.roleType !== "Owner" && m.roleType !== "Engine" && (
              <button
                onClick={() => removeTeamMember(m.id)}
                className="absolute top-4 right-4 text-on-surface-variant hover:text-error transition-colors cursor-pointer opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-error/10"
                aria-label={`Remove ${m.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Invite Member Modal */}
      <AnimatePresence>
        {isInviteOpen && (
          <div className={MODAL_BACKDROP}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="nexora-card w-full max-w-md p-6 shadow-2xl bg-surface-container"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Invite Team Member
                </h3>
                <button
                  onClick={() => setIsInviteOpen(false)}
                  className="press p-1 rounded-lg text-on-surface-variant hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleInvite} className="space-y-4 mt-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Connor"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-[color,background-color,border-color,box-shadow,transform,opacity] text-xs font-mono shadow-inner"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Role Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Database Administrator"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-[color,background-color,border-color,box-shadow,transform,opacity] text-xs font-mono shadow-inner"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sarah.c@nexora.io"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-[color,background-color,border-color,box-shadow,transform,opacity] text-xs font-mono shadow-inner"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Permission Tier
                  </label>
                  <select
                    value={formData.roleType}
                    onChange={(e) => setFormData({ ...formData, roleType: e.target.value })}
                    className="bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-[color,background-color,border-color,box-shadow,transform,opacity] text-xs font-mono cursor-pointer shadow-inner"
                  >
                    <option value="Editor">Editor (Read/Write)</option>
                    <option value="Viewer">Viewer (Read Only)</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="flex-1 py-2.5 border border-white/10 hover:border-white/20 text-white font-mono text-xs uppercase tracking-wider font-semibold rounded-xl transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-primary text-black font-mono text-xs uppercase tracking-wider font-bold hover:bg-primary/95 rounded-xl transition-[color,background-color,border-color,box-shadow,transform,opacity] active:scale-[0.98] cursor-pointer shadow-lg"
                  >
                    Send Invite
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Local-first workspace sharing */}
      <WorkspaceBundleCard />
    </motion.div>
  );
}
