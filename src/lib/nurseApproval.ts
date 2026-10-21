// What an admin must see before a nurse can be APPROVED — enforced by
// PATCH /api/admin/nurses/[id] and shown as a checklist in the admin nurses
// drawer (GET returns it). Documents aren't just "uploaded": each file's
// bytes are read back from S3 and sniffed (src/lib/fileSniff.ts), so a file
// that slipped in before uploads were checked — an HTML page saved as the
// KYC "image" — can't pass.

import { readUploadHead } from "@/lib/s3";
import { sniffFileType, type SniffedType } from "@/lib/fileSniff";

export type ApprovalItem = { key: string; label: string; ok: boolean; problem: string | null };

type Profile = {
  councilRegNo: string | null;
  councilCertUrl: string | null;
  degreeCertUrl: string | null;
  kycDocUrl: string | null;
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
};

const DOCUMENTS: readonly SniffedType[] = ["application/pdf", "image/jpeg", "image/png"];
const IMAGES: readonly SniffedType[] = ["image/jpeg", "image/png"];

async function fileProblem(url: string | null, allowed: readonly SniffedType[]): Promise<string | null> {
  if (!url) return "Not uploaded yet";
  let head: Uint8Array | "foreign" | "missing";
  try {
    head = await readUploadHead(url, "nurse-docs");
  } catch {
    // Couldn't reach S3 — don't approve on a file nobody could check.
    return "Couldn't check the file right now — try again";
  }
  if (head === "foreign") return "Not a file uploaded through the app";
  if (head === "missing") return "The uploaded file is missing — ask the nurse to upload it again";
  const type = sniffFileType(head);
  if (!type || !allowed.includes(type)) {
    const kinds = allowed.map((t) => (t === "application/pdf" ? "PDF" : t === "image/png" ? "PNG" : "JPG")).join(" / ");
    return `Not a real ${kinds} — the file is something else. Ask the nurse to upload it again`;
  }
  return null;
}

export async function nurseApprovalChecklist(p: Profile): Promise<{ items: ApprovalItem[]; ready: boolean }> {
  const [councilCert, degreeCert, kyc, photo] = await Promise.all([
    fileProblem(p.councilCertUrl, DOCUMENTS),
    fileProblem(p.degreeCertUrl, DOCUMENTS),
    fileProblem(p.kycDocUrl, DOCUMENTS),
    fileProblem(p.photoUrl, IMAGES),
  ]);
  const item = (key: string, label: string, problem: string | null): ApprovalItem => ({ key, label, ok: problem === null, problem });
  const items = [
    item("councilRegNo", "Nursing Council registration number", p.councilRegNo?.trim() ? null : "Not added yet"),
    item("councilCert", "Council registration certificate", councilCert),
    item("degreeCert", "Degree / diploma certificate", degreeCert),
    item("kyc", "KYC document (Aadhaar / PAN)", kyc),
    item("photo", "Profile photo", photo),
    item("location", "Base location", p.lat != null && p.lng != null ? null : "Not set — patients can't be matched to this nurse"),
  ];
  return { items, ready: items.every((i) => i.ok) };
}
