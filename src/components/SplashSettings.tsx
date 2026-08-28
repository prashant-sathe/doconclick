"use client";
import { useEffect, useRef, useState } from "react";
import { Smartphone, ImagePlus, Loader2, Check, Trash2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SplashFit = "cover" | "contain";

// Admin control for the mobile app's dynamic splash overlay (SplashOverlay.tsx).
// The image is stored on S3 and its URL + display options live on
// PlatformSettings; the app reads them from /api/app-config.
export default function SplashSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fit, setFit] = useState<SplashFit>("cover");
  const [bgColor, setBgColor] = useState("#F8FAFC");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        setImageUrl(s.splashImageUrl ?? null);
        setFit(s.splashFit === "contain" ? "contain" : "cover");
        setBgColor(s.splashBgColor ?? "#F8FAFC");
      })
      .catch(() => setError("Could not load splash settings."))
      .finally(() => setLoading(false));
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/settings/upload-splash", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      const { url } = await res.json();
      setImageUrl(url);
      setSaved(false);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not upload the image.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splashImageUrl: imageUrl, splashFit: fit, splashBgColor: bgColor }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not save.");
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-blue-500" /> Mobile App Splash Screen
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Shown while the app loads, on both iOS and Android. Changes take effect the
        next time a user opens the app.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Live preview — phone-shaped frame */}
          <div className="flex-shrink-0 mx-auto sm:mx-0">
            <div
              className="w-[140px] h-[280px] rounded-[1.75rem] border-4 border-slate-800 overflow-hidden flex items-center justify-center relative"
              style={{ background: bgColor }}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Splash preview"
                  className={cn(
                    fit === "cover" ? "absolute inset-0 w-full h-full object-cover" : "max-w-[70%] max-h-[42%] object-contain",
                  )}
                />
              ) : (
                <span className="text-[10px] text-slate-400 px-3 text-center">No image set</span>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {imageUrl ? "Replace image" : "Upload image"}
                </button>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">JPG, PNG or WebP · up to 5MB · use a tall image for best fit.</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Display</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "cover", label: "Full-screen", hint: "Fills the whole screen" },
                  { value: "contain", label: "Centered logo", hint: "On the background color" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFit(opt.value)}
                    className={cn(
                      "text-left rounded-xl border p-3 transition",
                      fit === opt.value ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span className="block text-sm font-semibold text-slate-800">{opt.label}</span>
                    <span className="block text-[11px] text-slate-500">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={cn(fit === "cover" && "opacity-50 pointer-events-none")}>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                Background color {fit === "cover" && "(used for centered mode)"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 bg-white p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-mono"
                  placeholder="#F8FAFC"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </p>
            )}

            <button
              type="button"
              onClick={save}
              disabled={saving || uploading}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
              {saved ? "Saved" : "Save splash settings"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
