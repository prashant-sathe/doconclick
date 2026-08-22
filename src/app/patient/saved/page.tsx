"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Bookmark, BookmarkX, Building2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useSpecialties } from "@/lib/useSpecialties";
import { formatDoctorName } from "@/lib/utils";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";

interface SavedDoctorEntry {
  id: string;
  doctor: {
    id: string;
    name: string;
    doctorProfile: {
      specialty: string;
      photoUrl: string | null;
      clinicName: string | null;
      qualification: string | null;
      experience: number;
      consultFee: number;
      avgRating: number;
      totalReviews: number;
      status: string;
    } | null;
  };
}

export default function SavedDoctorsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { colorFor } = useSpecialties();
  const [saved, setSaved] = useState<SavedDoctorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/patients/me/saved-doctors")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setSaved(d); setLoading(false); });
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "PATIENT")) {
      router.replace("/login");
      return;
    }
    if (user) load();
  }, [user, authLoading, router]);

  const remove = async (doctorId: string) => {
    setRemovingId(doctorId);
    setSaved((prev) => prev.filter((s) => s.doctor.id !== doctorId));
    await fetch(`/api/patients/me/saved-doctors/${doctorId}`, { method: "DELETE" });
    setRemovingId(null);
  };

  if (authLoading || !user || user.role !== "PATIENT") {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900">Saved Doctors</h1>
          <p className="text-slate-500 text-sm">Doctors you&apos;ve bookmarked for a quick re-booking later.</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
        ) : saved.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Bookmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No saved doctors yet.</p>
            <Link href="/patient/dashboard" className="inline-block mt-3 text-sm font-semibold text-blue-600 hover:underline">
              Find a doctor to save
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {saved.map(({ id, doctor }) => {
              const profile = doctor.doctorProfile;
              return (
                <div key={id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                  {profile?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.photoUrl} alt={doctor.name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 shadow" />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-lg font-extrabold shadow"
                      style={{ background: `linear-gradient(135deg, ${colorFor(profile?.specialty ?? "")}, ${colorFor(profile?.specialty ?? "")}99)` }}
                    >
                      {doctor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 truncate">{formatDoctorName(doctor.name)}</span>
                      {profile?.status === "APPROVED" && <VerifiedBadge />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{profile?.specialty}</p>
                    {profile?.clinicName && (
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                        <Building2 className="w-3 h-3 flex-shrink-0" /> {profile.clinicName}
                      </p>
                    )}
                    <div className="mt-1">
                      <RatingStars avgRating={profile?.avgRating ?? 0} totalReviews={profile?.totalReviews ?? 0} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Link href={`/patient/book?doctorId=${doctor.id}`} className="btn-primary py-2 px-3 text-xs whitespace-nowrap">
                      Book Again
                    </Link>
                    <button
                      onClick={() => remove(doctor.id)}
                      disabled={removingId === doctor.id}
                      className="btn-secondary py-2 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50"
                    >
                      <BookmarkX className="w-3.5 h-3.5" /> Remove
                    </button>
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
