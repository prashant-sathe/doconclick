// What an uploaded file actually is, from its first bytes ("magic numbers")
// — never from the browser-supplied MIME type or the file name, which the
// client controls (an HTML page sent as "image/png" would otherwise be
// stored, and served from our bucket, as an image). Used by every upload
// route before anything reaches S3.

export type SniffedType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";

const EXTENSION: Record<SniffedType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const LABEL: Record<SniffedType, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
};

const startsWith = (buf: Uint8Array, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** The type the bytes say this is, or null if it's none we accept. */
export function sniffFileType(buf: Uint8Array): SniffedType | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF….WEBP
  return null;
}

/**
 * Checks an upload's bytes against the types this route accepts and the
 * type the client declared. Returns the sniffed type (use it as the S3
 * ContentType) and its extension, or a user-facing error.
 */
export function verifyUpload(
  buf: Uint8Array,
  declaredType: string,
  allowed: readonly string[],
): { type: SniffedType; ext: string } | { error: string } {
  const sniffed = sniffFileType(buf);
  const labels = allowed.filter((t): t is SniffedType => t in LABEL).map((t) => LABEL[t]);
  const accepted = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}` : labels[0] ?? "supported";
  if (!sniffed || !allowed.includes(sniffed)) {
    return { error: `This file isn't a real ${accepted} file. Please upload the original document or photo.` };
  }
  // "image/jpg" is a common (non-standard) spelling of image/jpeg.
  const declared = declaredType === "image/jpg" ? "image/jpeg" : declaredType;
  if (declared !== sniffed) {
    const claimed = LABEL[declared as SniffedType] ?? (declaredType || "another type");
    return { error: `This file is marked as ${claimed} but it's actually a ${LABEL[sniffed]}. Please upload the original file.` };
  }
  return { type: sniffed, ext: EXTENSION[sniffed] };
}
