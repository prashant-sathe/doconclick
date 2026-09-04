"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import LegalContent from "@/components/LegalContent";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, LEGAL_LAST_UPDATED } from "@/lib/legalContent";

export default function PatientTermsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/profile/terms");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  return (
    <ProfileSubShell
      title="Terms & Privacy Policy"
      description={`Last updated ${LEGAL_LAST_UPDATED}`}
      icon={<FileCheck className="w-5 h-5" />}
      tint="bg-blue-50 text-blue-600"
      loading={authLoading || !user}
    >
      <div className="space-y-8">
        <LegalContent title="Terms of Service" sections={TERMS_OF_SERVICE} />
        <LegalContent title="Privacy Policy" sections={PRIVACY_POLICY} />
      </div>
    </ProfileSubShell>
  );
}
