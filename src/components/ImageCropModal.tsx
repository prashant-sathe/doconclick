"use client";
import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, X, ZoomIn } from "lucide-react";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getCroppedBlob(imageSrc: string, area: Area, mimeType: string): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop image"))), mimeType, 0.92);
  });
}

// Crop-before-upload step for profile and clinic photos — picking a file
// opens this instead of uploading it straight away, so a doctor can frame
// a face-crop or clinic shot rather than uploading whatever the camera gave.
export default function ImageCropModal({ file, aspect, round, onCancel, onConfirm }: {
  file: File;
  aspect: number;
  round?: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [imageSrc] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const cleanup = () => URL.revokeObjectURL(imageSrc);

  const cancel = () => {
    cleanup();
    onCancel();
  };

  const confirm = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    setError("");
    try {
      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, mimeType);
      cleanup();
      onConfirm(blob);
    } catch {
      setError("Could not crop this image. Please try another photo.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Crop photo</h3>
          <button type="button" onClick={cancel} className="text-slate-300 hover:text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative w-full h-72 bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={round ? "round" : "rect"}
            showGrid={!round}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <ZoomIn className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-teal-500"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={cancel} disabled={busy} className="btn-secondary flex-1 disabled:opacity-60">
              Cancel
            </button>
            <button
              type="button" onClick={confirm} disabled={busy || !croppedAreaPixels}
              className="btn-primary flex-1 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Use Photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
