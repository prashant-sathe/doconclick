import { isNative } from "@/lib/platform";

/**
 * Browser downloads (`<a download>`, `Blob` URLs, `pdf.save()`) are inert inside
 * the Capacitor WebView. On native we instead write the file into the app's
 * cache dir and hand it to the OS share sheet, where the user can "Save to
 * Files", open it in a PDF viewer, print, or send it on.
 *
 * `base64` must be the raw base64 payload (no `data:...;base64,` prefix); the
 * OS infers the type from `fileName`'s extension. Returns true if it handled
 * the save natively; false on web (caller should fall back to its normal
 * browser download).
 */
export async function saveOrShareFile(
  fileName: string,
  base64: string,
): Promise<boolean> {
  if (!isNative()) return false;

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);

  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  });

  await Share.share({
    title: fileName,
    url: uri,
    dialogTitle: "Save or share",
  });

  return true;
}

/**
 * Downloads a file addressed by URL (relative or absolute). On web this is a
 * normal browser download; inside the Capacitor WebView `<a download>` / blob
 * downloads are inert, so the bytes are fetched, base64-encoded and handed to
 * `saveOrShareFile` (OS share sheet → Save to Files / open / print / send on).
 *
 * Throws on a failed fetch so the caller can surface an error.
 */
export async function downloadOrShareUrl(url: string, fileName: string): Promise<void> {
  if (!isNative()) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download the file");
  const blob = await res.blob();

  const base64: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(blob);
  });

  await saveOrShareFile(fileName, base64);
}
