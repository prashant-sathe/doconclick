"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2, Heart, Building2, Video, Home, Clock, Languages, UserX,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useSpecialties } from "@/lib/useSpecialties";
import RatingStars from "@/components/patient/RatingStars";
import VerifiedBadge from "@/components/patient/VerifiedBadge";

interface DoctorProfileData {
  id: string;
  name: string;
  doctorProfile: {
    photoUrl: string | null;
    clinicName: string | null;
    clinicPhotoUrl: string | null;
    qualification: string | null;
    medRegNo: string | null;
    specialty: string;
    experience: number;
    consultFee: number;
    videoFee: number;
    homeVisitFee: number;
    availability: string;
    languages: string;
    bio: string | null;
    offersHomeVisit: boolean;
    offersClinic: boolean;
    offersVideo: boolean;
    isVerified: boolean;
    avgRating: number;
    totalReviews: number;
  } | null;
}

interface DoctorReview {
  id: string;
  rating: number;
  comment: string | null;
  patient: { name: string };
}

function Header() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow">
            <Heart className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-slate-900">DocOnClick</span>
        </Link>
        <Link href={user ? "/patient/dashboard" : "/login"} className="btn-secondary py-2 px-3.5 text-sm">
          {user ? "My Dashboard" : "Login"}
        </Link>
      </div>
    </header>
  );
}

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { colorFor } = useSpecialties();
  const [doctor, setDoctor] = useState<DoctorProfileData | null | undefined>(undefined);
  const [reviews, setReviews] = useState<DoctorReview[]>([]);

  useEffect(() => {
    fetch(`/api/doctors/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDoctor);
    fetch(`/api/doctors/${id}/reviews`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setReviews);
  }, [id]);

  if (doctor === undefined) {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (doctor === null || !doctor.doctorProfile) {
    return (
      <div className="min-h-screen gradient-surface">
        <Header />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <UserX className="w-7 h-7 text-slate-400" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">Doctor not found</h1>
          <p className="text-sm text-slate-500">This profile link is invalid or no longer available.</p>
        </div>
      </div>
    );
  }

  const profile = doctor.doctorProfile;

  return (
    <div className="min-h-screen gradient-surface pb-16">
      <Header />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {profile.clinicPhotoUrl && (
            <div className="w-full h-40 sm:h-48 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.clinicPhotoUrl}
                alt={profile.clinicName ? `${profile.clinicName} — clinic photo` : "Clinic photo"}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            {profile.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoUrl}
                alt={doctor.name}
                className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 shadow"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-xl font-extrabold shadow"
                style={{ background: `linear-gradient(135deg, ${colorFor(profile.specialty)}, ${colorFor(profile.specialty)}99)` }}
              >
                {doctor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-extrabold text-slate-900 leading-tight">{doctor.name}</h1>
                {profile.isVerified && <VerifiedBadge />}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{profile.specialty}</p>
              <p className="text-xs text-slate-400 mt-0.5">{profile.qualification}</p>
              {profile.clinicName && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3 flex-shrink-0" /> {profile.clinicName}
                </p>
              )}
              <div className="mt-1.5">
                <RatingStars avgRating={profile.avgRating} totalReviews={profile.totalReviews} />
              </div>
            </div>
          </div>

          {/* Chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            <span className="badge badge-info">{profile.experience} yrs exp</span>
            <span className="badge badge-gray">
              <Clock className="w-3 h-3" /> {profile.availability}
            </span>
            <span className="badge badge-purple">
              <Languages className="w-3 h-3" /> {profile.languages}
            </span>
          </div>

          {profile.bio && (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3.5 mb-5 leading-relaxed">
              {profile.bio}
            </p>
          )}

          {/* Fee cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {profile.offersClinic ? (
              <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                <Building2 className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Clinic Visit</p>
                <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{profile.consultFee}</p>
              </div>
            ) : (
              <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center flex flex-col items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                <p className="text-xs text-slate-400">Clinic visit not offered</p>
              </div>
            )}
            {profile.offersVideo ? (
              <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center">
                <Video className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Video Call</p>
                <p className="text-base font-extrabold text-slate-900 mt-0.5">₹{profile.videoFee}</p>
              </div>
            ) : (
              <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center flex flex-col items-center justify-center">
                <Video className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                <p className="text-xs text-slate-400">Video call not offered</p>
              </div>
            )}
            {profile.offersHomeVisit ? (
              <div className="rounded-2xl p-4 border border-blue-200 bg-blue-50 text-center">
                <Home className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-blue-600">Home Visit</p>
                <p className="text-base font-extrabold text-blue-700 mt-0.5">₹{profile.homeVisitFee}</p>
              </div>
            ) : (
              <div className="rounded-2xl p-4 border border-slate-100 bg-slate-50 text-center flex flex-col items-center justify-center">
                <Home className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                <p className="text-xs text-slate-400">Home visit not offered</p>
              </div>
            )}
          </div>

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Reviews</p>
              <div className="space-y-2">
                {reviews.slice(0, 4).map((r) => (
                  <div key={r.id} className="bg-slate-50 rounded-xl px-3 py-2">
                    <RatingStars avgRating={r.rating} totalReviews={1} />
                    {r.comment && <p className="text-xs text-slate-600 mt-1">&ldquo;{r.comment}&rdquo;</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">{r.patient.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link href={`/patient/book?doctorId=${doctor.id}`} className="btn-primary w-full justify-center py-3.5 text-base">
            Book Appointment
          </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
