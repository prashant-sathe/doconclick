import type { Metadata } from "next";
import PatientRegisterClient from "./PatientRegisterClient";

export const metadata: Metadata = {
  title: "Patient Sign Up",
  description: "Create a free DocOnClick patient account to book verified doctors for clinic, home, or video consultations.",
  alternates: { canonical: "/patient/register" },
};

export default async function PatientRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  return <PatientRegisterClient next={typeof next === "string" ? next : undefined} />;
}
