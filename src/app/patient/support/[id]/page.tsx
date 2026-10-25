"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import ComplaintThread from "@/components/support/ComplaintThread";

export default function PatientSupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "PATIENT")) router.replace("/login");
  }, [user?.id, user?.role, authLoading, router]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || !user || user.role !== "PATIENT") {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
        <ComplaintThread id={id} backHref="/patient/support" accent="blue" />
      </div>
    </div>
  );
}
