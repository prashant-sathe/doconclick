"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2, Plus, Trash2, AlertCircle, X } from "lucide-react";
import Link from "next/link";

type ButtonRow = { label: string; url: string };

const AUDIENCE_OPTIONS = [
  { value: "PATIENT", label: "Patients" },
  { value: "DOCTOR", label: "Doctors" },
  { value: "BOTH", label: "Both" },
];

export default function NewAnnouncement() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("PATIENT");
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(null);
  const [buttons, setButtons] = useState<ButtonRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/announcements/upload-banner", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      const { url } = await res.json();
      setBannerImageUrl(url);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not upload banner image.");
    }
  };

  const addButton = () => {
    if (buttons.length >= 2) return;
    setButtons([...buttons, { label: "", url: "" }]);
  };

  const updateButton = (i: number, field: keyof ButtonRow, value: string) => {
    setButtons(buttons.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)));
  };

  const removeButton = (i: number) => {
    setButtons(buttons.filter((_, idx) => idx !== i));
  };

  const saveDraft = async () => {
    setError("");
    if (!title.trim() || !message.trim()) {
      setError("Title and message are required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, audience, bannerImageUrl, buttons }),
    });
    setSaving(false);
    if (res.ok) {
      const created = await res.json();
      router.push(`/admin/announcements/${created.id}`);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not save draft.");
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/admin/announcements" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Announcements
      </Link>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">New Announcement</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="input-label">Title</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali offer — 20% off consultations" />
          </div>

          <div>
            <label className="input-label">Message</label>
            <textarea
              className="input-field"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the announcement text…"
            />
          </div>

          <div>
            <label className="input-label">Banner Image (optional)</label>
            {bannerImageUrl ? (
              <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bannerImageUrl} alt="Banner" className="w-full h-full object-cover" />
                <button
                  onClick={() => setBannerImageUrl(null)}
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center gap-2 text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                <span className="text-sm font-medium">{uploading ? "Uploading…" : "Upload banner (JPG/PNG, max 5MB)"}</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleBannerChange} className="hidden" />
          </div>

          <div>
            <label className="input-label">Send To</label>
            <div className="flex gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAudience(opt.value)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    audience === opt.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="input-label mb-0">Action Buttons (optional, max 2)</label>
              {buttons.length < 2 && (
                <button onClick={addButton} className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add button
                </button>
              )}
            </div>
            <div className="space-y-2 mt-2">
              {buttons.map((b, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input
                    className="input-field flex-1"
                    placeholder="Label, e.g. Book Now"
                    value={b.label}
                    onChange={(e) => updateButton(i, "label", e.target.value)}
                  />
                  <input
                    className="input-field flex-1"
                    placeholder="URL, e.g. /patient/dashboard"
                    value={b.url}
                    onChange={(e) => updateButton(i, "url", e.target.value)}
                  />
                  <button onClick={() => removeButton(i)} className="p-2.5 text-slate-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <span className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}

          <button onClick={saveDraft} disabled={saving} className="btn-primary w-full py-2.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? "Saving…" : "Save as Draft"}
          </button>
        </div>

        {/* Preview */}
        <div>
          <p className="input-label mb-2">Preview</p>
          <div className="bg-slate-100 rounded-2xl p-6 flex items-center justify-center min-h-[20rem]">
            <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full overflow-hidden">
              {bannerImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerImageUrl} alt="Banner" className="w-full h-32 object-cover" />
              )}
              <div className="p-5">
                <h3 className="text-base font-extrabold text-slate-900">{title || "Announcement title"}</h3>
                <p className="text-sm text-slate-500 mt-1.5 whitespace-pre-wrap">
                  {message || "Your announcement message will appear here."}
                </p>
                {buttons.length > 0 && (
                  <div className="flex gap-2 mt-4">
                    {buttons.map((b, i) => (
                      <span
                        key={i}
                        className={`flex-1 text-center py-2 rounded-lg text-xs font-semibold ${
                          i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {b.label || "Button"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
