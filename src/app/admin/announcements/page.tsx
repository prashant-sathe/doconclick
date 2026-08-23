"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Plus, Users, Stethoscope, UserCircle } from "lucide-react";

interface AnnouncementRow {
  id: string;
  title: string;
  audience: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  _count: { recipients: number };
}

const AUDIENCE_ICON: Record<string, typeof Users> = {
  DOCTOR: Stethoscope,
  PATIENT: UserCircle,
  BOTH: Users,
};

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/announcements")
      .then((r) => r.json())
      .then((d) => { setAnnouncements(d); setLoading(false); });
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Announcements</h1>
          <p className="text-slate-500 text-sm mt-1">
            Broadcast a message with an optional banner and action buttons to doctors, patients, or both.
          </p>
        </div>
        <Link href="/admin/announcements/new" className="btn-primary py-2.5 px-4">
          <Plus className="w-4 h-4" /> New Announcement
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          No announcements yet.
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const AudienceIcon = AUDIENCE_ICON[a.audience] ?? Users;
            return (
              <Link
                key={a.id}
                href={`/admin/announcements/${a.id}`}
                className="block bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-slate-200 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <AudienceIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-900 truncate">{a.title}</span>
                    <span className={a.status === "SENT" ? "badge badge-success" : "badge badge-gray"}>
                      {a.status === "SENT" ? "Sent" : "Draft"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex-shrink-0">
                    {a.status === "SENT"
                      ? `${a._count.recipients} recipients · ${new Date(a.sentAt!).toLocaleDateString("en-IN")}`
                      : `Created ${new Date(a.createdAt).toLocaleDateString("en-IN")}`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
