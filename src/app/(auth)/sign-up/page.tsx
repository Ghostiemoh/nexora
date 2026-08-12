import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Create an account · Nexora",
  description:
    "Create a Nexora account to carry your work between devices. Records are encrypted on your device first, and the password cannot be reset.",
};

export default function SignUpPage() {
  return <AuthPage mode="up" />;
}
