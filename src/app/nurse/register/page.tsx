import type { Metadata } from "next";
import NurseRegisterClient from "./NurseRegisterClient";

export const metadata: Metadata = {
  title: "Join as a Nurse",
  description: "Register as a verified nurse on DocOnClick and get home-visit bookings — injections, dressing, IV, elderly care and more.",
  alternates: { canonical: "/nurse/register" },
};

export default function NurseRegisterPage() {
  return <NurseRegisterClient />;
}
