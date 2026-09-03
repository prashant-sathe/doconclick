"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LifeBuoy, AlertCircle, Clock, CheckCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { formatDoctorName } from "@/lib/utils";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: "badge badge-danger",
  IN_PROGRESS: "badge badge-warning",
  RESOLVED: "badge badge-success",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN: AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCheck,
};

export default function DoctorSupportTicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "DOCTOR")) {
      router.replace("/login");
      return;
    }
    if (user) {
      fetch("/api/doctor/complaints")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { setTickets(d); setLoading(false); });
    }
  }, [user, authLoading, router]);

  if (authLoading || !user || user.role !== "DOCTOR") {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">My Support Tickets</h1>
            <p className="text-slate-500 text-sm">
              Hi {formatDoctorName(user.name)}, here&apos;s every ticket you&apos;ve raised with the DocOnClick team.
            </p>
          </div>
          <Link href="/doctor/support" className="btn-primary py-2.5 px-4 text-sm flex-shrink-0">
            <Sparkles className="w-4 h-4" /> Ask Support Assistant
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <LifeBuoy className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-3">No tickets raised yet.</p>
            <Link href="/doctor/support" className="inline-block text-sm font-semibold text-teal-600 hover:underline">
              Ask the Support Assistant to raise one
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const Icon = STATUS_ICON[t.status] ?? AlertCircle;
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start gap-3">
                    <div className={
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 " +
                      (t.status === "RESOLVED" ? "bg-emerald-50 text-emerald-500" : t.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500")
                    }>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-slate-900 truncate">{t.subject}</span>
                        <span className={STATUS_BADGE[t.status] ?? "badge badge-gray"}>{t.status.replace("_", " ")}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-1 whitespace-pre-wrap">{t.description}</p>
                      <p className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
