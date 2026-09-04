"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { useAuth } from "@/components/AuthProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.push("/login?next=/admin");
    if (!loading && user && user.role !== "ADMIN") router.push("/login");
  }, [loading, user, router]);

  if (loading || !user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      {/* Inline `style` can't be responsive, so the mobile top-bar's 3.5rem
          offset (absent on lg: and up, where the sidebar itself starts below
          the banner) has to be expressed as an arbitrary-value class instead
          — same --imp-banner-h var, just gated per breakpoint. */}
      <main className="flex-1 lg:ml-64 min-h-screen pt-[calc(3.5rem+var(--imp-banner-h,0px))] lg:pt-[var(--imp-banner-h,0px)]">
        {children}
      </main>
    </div>
  );
}
