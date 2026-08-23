import type { Metadata } from "next";
import LoginPageClient from "./LoginPageClient";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your DocOnClick account to book doctors, manage appointments, and consult online.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return <LoginPageClient />;
}
