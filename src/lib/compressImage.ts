"use client";

// Phone-camera photos are routinely 4–8 MB, over the 5 MB upload limit — so
// a nurse photographing a certificate would just get "File must be under
// 5MB". Shrink big images in the browser first: longest side ≤ 2000px (still
// sharp enough to read a certificate), re-encoded as JPEG. Non-images (PDF)
// and already-small files pass through untouched, and so does anything the
// browser can't decode — the server's own checks still apply.

const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_SIDE_PX = 2000;
const JPEG_QUALITY = 0.82;

async function decode(file: File): Promise<{ img: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return { img: bmp, width: bmp.width, height: bmp.height };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    return { img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= COMPRESS_ABOVE_BYTES) return file;
  try {
    const { img, width, height } = await decode(file);
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha — paint white first so transparent PNG scans don't turn black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/**
 * What every upload should send: the picked file re-read into memory (on
 * Android a File straight from <input type="file"> is a content:// URI the
 * WebView often can't stream into a fetch() body — "Failed to fetch"), then
 * shrunk if it's a big photo.
 */
export async function prepareUpload(file: File): Promise<File> {
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsArrayBuffer(file);
  });
  const inMemory = new File([bytes], file.name, { type: file.type || "application/octet-stream", lastModified: file.lastModified });
  return compressImage(inMemory);
}

/**
 * Same, for callers that may hold either a picked File or an already
 * in-memory Blob (e.g. the output of the image-crop modal, which is
 * full-resolution and can itself exceed 5 MB).
 */
export async function prepareBlobUpload(fileOrBlob: File | Blob, fallbackName: string): Promise<File> {
  if (fileOrBlob instanceof File) return prepareUpload(fileOrBlob);
  return compressImage(new File([fileOrBlob], fallbackName, { type: fileOrBlob.type || "image/jpeg" }));
}

/** User-facing message for a file that's still too big after compression. */
export function tooBigMessage(file: File, maxBytes = 5 * 1024 * 1024): string | null {
  if (file.size <= maxBytes) return null;
  return file.type === "application/pdf"
    ? "This PDF is over 5 MB. Upload a smaller PDF, or a photo of the document instead."
    : "This file is over 5 MB even after compressing. Try a smaller photo.";
}
