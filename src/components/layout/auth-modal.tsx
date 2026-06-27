"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Mail, Lock, User, Sparkles, ShieldCheck } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Esc key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden"; // Prevent background scroll
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simulate secure network loop
    setTimeout(() => {
      if (!email.includes("@")) {
        setError("Please enter a valid cryptographic email address.");
        setLoading(false);
      } else {
        setLoading(false);
        onClose();
      }
    }, 1200);
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 select-none animate-fade-in"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-surface-container-low/90 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] relative overflow-hidden"
      >
        {/* Subtle top decoration */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary/30 via-primary to-primary/30" />

        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close authentication modal"
          className="absolute top-4 right-4 p-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-white hover:bg-surface-container-high transition-all active:scale-90 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(192,193,255,0.15)]">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white font-sans">
            {isSignUp ? "Create Ingest Account" : "Access Database replica"}
          </h2>
          <p className="text-xs text-on-surface-variant max-w-[30ch] mx-auto">
            {isSignUp
              ? "Join Nexora Sandbox to compile and persist local analytical reports."
              : "Verify credential keys to initialize your client sandbox partition."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-name" className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                Full Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Julian Vercauteren"
                  className="w-full bg-surface-container border border-outline-variant/80 rounded-lg py-2 pl-9 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-body-md transition-all"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-email" className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="analyst@coreflow.io"
                className="w-full bg-surface-container border border-outline-variant/80 rounded-lg py-2 pl-9 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-body-md transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label htmlFor="auth-password" className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                Credential Key
              </label>
              {!isSignUp && (
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline cursor-pointer"
                >
                  Forgot Key?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder="••••••••••••"
                className="w-full bg-surface-container border border-outline-variant/80 rounded-lg py-2 pl-9 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-body-md transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="text-error text-xs flex items-center gap-1.5 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary text-on-primary font-bold hover:bg-primary-fixed rounded-lg text-body-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(192,193,255,0.2)] disabled:opacity-50"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
            ) : isSignUp ? (
              "Initialize Replica Key"
            ) : (
              "Authenticate Sandbox"
            )}
          </button>
        </form>

        {/* Third-party divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant/40" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-mono">
            <span className="bg-surface-container-low px-3 text-on-surface-variant">Secure Identity Link</span>
          </div>
        </div>

        {/* Social Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button className="flex items-center justify-center gap-2 py-2 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container hover:text-white text-on-surface-variant text-body-md transition-all active:scale-95 cursor-pointer">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
            </svg>
            GitHub
          </button>
          <button className="flex items-center justify-center gap-2 py-2 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container hover:text-white text-on-surface-variant text-body-md transition-all active:scale-95 cursor-pointer">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google
          </button>
        </div>

        {/* Toggle link */}
        <div className="text-center text-[12px] text-on-surface-variant mt-4">
          {isSignUp ? "Already have a key replica? " : "New to Nexora Analytics? "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary hover:underline font-bold cursor-pointer"
          >
            {isSignUp ? "Authenticate" : "Create Key Replica"}
          </button>
        </div>

        {/* Security badge footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-zinc-500 font-mono border-t border-outline-variant/30 pt-4">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Local Sandboxed Auth Protocol</span>
        </div>
      </div>
    </div>
  );
}
