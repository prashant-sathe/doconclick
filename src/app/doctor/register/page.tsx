import type { Metadata } from "next";
import DoctorRegisterClient from "./DoctorRegisterClient";

export const metadata: Metadata = {
  title: "Join as a Doctor",
  description: "Register as a verified doctor on DocOnClick and start seeing patients for clinic, home, or video consultations.",
  alternates: { canonical: "/doctor/register" },
};

export default function DoctorRegisterPage() {
  return <DoctorRegisterClient />;
}
