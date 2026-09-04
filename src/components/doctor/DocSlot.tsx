"use client";
import { useState } from "react";
import { Loader2, UploadCloud, Lock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageCropModal from "@/components/ImageCropModal";
import ConfirmDialog from "@/components/ConfirmDialog";

const FIELD_FOR: Record<string, string> = {
  photo: "photoUrl",
  medRegCert: "medRegCertUrl",
  degreeCert: "degreeCertUrl",
  kyc: "kycDocUrl",
  signature: "signatureUrl",
};

// A single verification-document row: shows status, upload/replace/remove.
export default function DocSlot({
  label, icon: Icon, url, type, locked, required, requiredNote, accept, cropAspect, removable, onUploaded,
}: {
  label: string;
  icon: React.ElementType;
  url: string | null;
  type: keyof typeof FIELD_FOR | string;
  locked?: boolean;
  required?: boolean;
  requiredNote?: string;
  accept?: string;
  cropAspect?: number;
  removable?: boolean;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = async (fileOrBlob: File | Blob) => {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("type", type);
    form.append("file", fileOrBlob, `${type}.jpg`);
    const res = await fetch("/api/doctors/me/documents", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      onUploaded(data[FIELD_FOR[type as string]]);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Upload failed.");
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/doctors/me/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    setBusy(false);
    if (res.ok) onUploaded("");
    else setError((await res.json().catch(() => ({}))).error ?? "Could not remove.");
  };

  const onFileSelected = (file: File) => {
    if (cropAspect) setPendingFile(file);
    else upload(file);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 min-w-0">
        {(type === "photo" || type === "signature") && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={type === "photo" ? "Profile photo" : "Signature"}
            className={cn("flex-shrink-0 border border-slate-200 object-contain bg-white", type === "photo" ? "w-9 h-9 rounded-full object-cover" : "w-14 h-9 rounded-lg p-1")} />
        ) : (
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", url ? "bg-emerald-50" : "bg-slate-100")}>
            <Icon className={cn("w-4 h-4", url ? "text-emerald-600" : "text-slate-400")} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {label} {required && <span className="text-red-500">*</span>}
          </p>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 font-medium hover:underline">Uploaded — view file</a>
          ) : required ? (
            <p className="text-xs text-red-600 font-semibold">{requiredNote ?? "Required to get verified — not uploaded yet"}</p>
          ) : (
            <p className="text-xs text-slate-400">Not uploaded yet</p>
          )}
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>
      </div>
      {locked ? (
        <span className="text-xs text-slate-400 font-semibold flex items-center gap-1 flex-shrink-0">
          <Lock className="w-3.5 h-3.5" /> Verified &amp; locked
        </span>
      ) : (
        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="btn-secondary py-1.5 px-3 text-xs cursor-pointer">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            {url ? "Replace" : "Upload"}
            <input type="file" accept={accept ?? ".pdf,.jpg,.jpeg,.png"} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); e.target.value = ""; }} />
          </label>
          {removable && url && (
            <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy}
              className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-60" title="Remove">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {pendingFile && cropAspect && (
        <ImageCropModal
          file={pendingFile}
          aspect={cropAspect}
          round={type === "photo"}
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => { setPendingFile(null); upload(blob); }}
        />
      )}
      {confirmRemove && (
        <ConfirmDialog
          icon={Trash2}
          title={`Remove ${label}?`}
          message={required
            ? "You'll need to re-upload it before you can get verified or take bookings again."
            : "You can upload it again anytime."}
          confirmLabel="Remove"
          busyLabel="Removing…"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={async () => { await remove(); setConfirmRemove(false); }}
        />
      )}
    </div>
  );
}
