import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Sign in · Nexora",
  description:
    "Sign in to sync your datasets and cleaning recipes between devices, sealed on this machine before they leave. Nexora works without an account.",
};

export default function SignInPage() {
  return <AuthPage mode="in" />;
}
