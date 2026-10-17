"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { NurseHeader, NurseMobileNav } from "@/components/nurse/NurseNav";

// Shared frame for the nurse's account sub-pages (password, support, terms…).
export default function NurseSubShell({ title, description, icon, children }: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && (!user || user.role !== "NURSE")) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>;
  }
  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <NurseHeader />
      <NurseMobileNav />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/nurse/profile" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </Link>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">{icon}</span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
