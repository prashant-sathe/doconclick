import type { Metadata } from "next";
import PatientRegisterClient from "./PatientRegisterClient";

export const metadata: Metadata = {
  title: "Patient Sign Up",
  description: "Create a free DocOnClick patient account to book verified doctors for clinic, home, or video consultations.",
  alternates: { canonical: "/patient/register" },
};

export default function PatientRegisterPage() {
  return <PatientRegisterClient />;
}
