"use client";
import { useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { prepareUpload, tooBigMessage } from "@/lib/compressImage";

export const MAX_SYMPTOM_PHOTOS = 3;

export type SymptomPhoto = { id: string; fileUrl: string };

// Photos under "Symptoms / Reason" on a doctor booking. Each one is uploaded
// to the patient's vault right away; the booking just sends their ids as
// `symptomPhotoIds`. Used by /patient/book and the dashboard booking sheet.
export default function SymptomPhotoPicker({ photos, onChange, onError, className }: {
  photos: SymptomPhoto[];
  onChange: (next: SymptomPhoto[]) => void;
  onError: (message: string) => void;
  className?: string;
}) {
  const tf = useTranslations("booking.form");
  const [uploading, setUploading] = useState(false);

  const upload = async (original: File) => {
    setUploading(true); onError("");
    const file = await prepareUpload(original).catch(() => null);
    if (!file) { setUploading(false); onError(tf("photoReadFailed")); return; }
    const tooBig = tooBigMessage(file);
    if (tooBig) { setUploading(false); onError(tooBig); return; }
    const fd = new FormData();
    fd.append("title", tf("photoTitle"));
    fd.append("category", "Other");
    fd.append("file", file);
    const r = await fetch("/api/patients/me/documents", { method: "POST", body: fd }).catch(() => null);
    setUploading(false);
    if (!r?.ok) { onError((await r?.json().catch(() => ({})))?.error ?? tf("photoUploadFailed")); return; }
    const created = await r.json();
    onChange([...photos, { id: created.id, fileUrl: created.fileUrl }].slice(0, MAX_SYMPTOM_PHOTOS));
  };

  return (
    <div className={className}>
      <label className="input-label"><Camera className="inline w-3.5 h-3.5 mr-1 text-slate-500" />{tf("symptomPhotos")}</label>
      <p className="text-xs text-slate-500 -mt-0.5 mb-2">{tf("symptomPhotosHint")}</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary aspect ratio per upload, next/image needs a fixed intrinsic size */}
            <img src={p.fileUrl} alt={tf("photoTitle")} className="w-full h-full object-cover" />
            <button type="button" aria-label={tf("removePhoto")}
              onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {photos.length < MAX_SYMPTOM_PHOTOS && (
          <label className={cn("w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold cursor-pointer hover:border-blue-400 hover:text-blue-600", uploading && "opacity-60 pointer-events-none")}>
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            {tf("addPhoto")}
            <input type="file" className="hidden" accept="image/jpeg,image/png"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </label>
        )}
      </div>
    </div>
  );
}
