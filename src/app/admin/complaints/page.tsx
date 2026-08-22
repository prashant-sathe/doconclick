"use client";
import { useEffect, useState } from "react";
import { MessageCircle, CheckCheck, Clock, AlertCircle } from "lucide-react";
import { cn, formatDoctorName } from "@/lib/utils";

interface Complaint {
  id: string;
  user: { name: string; role: string };
  subject: string;
  description: string;
  status: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  OPEN:        "badge badge-danger",
  IN_PROGRESS: "badge badge-warning",
  RESOLVED:    "badge badge-success",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN:        AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED:    CheckCheck,
};

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch("/api/admin/complaints")
      .then((r) => r.json())
      .then((d) => { setComplaints(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/admin/complaints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Support & Complaints</h1>
        <p className="text-slate-500 text-sm mt-1">Review and resolve patient and doctor complaints.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {complaints.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No complaints yet.
            </div>
          )}
          {complaints.map((c) => {
            const Icon = STATUS_ICON[c.status] ?? AlertCircle;
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                      c.status === "RESOLVED" ? "bg-emerald-50 text-emerald-500" : c.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500"
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900">{c.subject}</span>
                        <span className={STATUS_BADGE[c.status]}>{c.status.replace("_", " ")}</span>
                        <span className="badge badge-gray text-xs">{c.user.role}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-1">{c.description}</p>
                      <div className="text-xs text-slate-400">
                        By <span className="font-medium text-slate-600">{c.user.role === "DOCTOR" ? formatDoctorName(c.user.name) : c.user.name}</span> · {new Date(c.createdAt).toLocaleDateString("en-IN")}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {c.status !== "IN_PROGRESS" && (
                      <button onClick={() => updateStatus(c.id, "IN_PROGRESS")} className="btn-secondary py-1.5 px-3 text-xs">
                        Mark In Progress
                      </button>
                    )}
                    {c.status !== "RESOLVED" && (
                      <button onClick={() => updateStatus(c.id, "RESOLVED")} className="btn-success py-1.5 px-3 text-xs">
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
