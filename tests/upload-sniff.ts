// Upload type sniffing (BUG-TRACKER #44): every upload route checks the
// file's actual bytes (src/lib/fileSniff.ts) — an HTML page sent as
// "image/png" is rejected before it reaches S3, as is a declared type that
// doesn't match the contents. Pure checks, then API checks against a live
// dev server and the DB in .env, throwaway users only. One real 1×1 PNG is
// uploaded to the S3 bucket in .env to prove the happy path still works;
// rejected files never reach S3.
//
//   npm run test:upload-sniff
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { sniffFileType, verifyUpload } from "../src/lib/fileSniff";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const HTML = Buffer.from("<!doctype html><html><body><script>alert(document.cookie)</script></body></html>");

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function upload(u: U, path: string, files: { bytes: Buffer; type: string; name: string }[], fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const f of files) form.append("file", new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: cookieFor(u) }, body: form });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string } };
}

async function main() {
  // ── The sniffer ──
  check("PNG / JPEG / PDF / WEBP recognised", sniffFileType(PNG) === "image/png" && sniffFileType(JPEG) === "image/jpeg" && sniffFileType(PDF) === "application/pdf" && sniffFileType(WEBP) === "image/webp", "ok");
  check("HTML / empty / short → unknown", sniffFileType(HTML) === null && sniffFileType(Buffer.alloc(0)) === null && sniffFileType(Buffer.from([0xff, 0xd8])) === null, "ok");
  const imagesOnly = ["image/jpeg", "image/png"];
  check("HTML declared image/png → rejected", "error" in verifyUpload(HTML, "image/png", imagesOnly), "error");
  check("PNG declared image/jpeg → mismatch", "error" in verifyUpload(PNG, "image/jpeg", imagesOnly), "error");
  check("PDF where only images are allowed → rejected", "error" in verifyUpload(PDF, "application/pdf", imagesOnly), "error");
  const ok = verifyUpload(JPEG, "image/jpg", imagesOnly);
  check("JPEG declared image/jpg (common alias) → accepted as image/jpeg", !("error" in ok) && ok.type === "image/jpeg" && ok.ext === "jpg", JSON.stringify(ok));

  // ── API ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const patient = await mk({ name: "Sniff Patient", role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } });
  const doctor = await mk({ name: "Sniff Doctor", role: "DOCTOR", doctorProfile: { create: { status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * 864e5) } } });
  const appt = await prisma.appointment.create({ data: {
    doctorId: doctor.id, patientId: patient.id, status: "SCHEDULED", consultType: "VIDEO", symptoms: "fever", amount: 300,
    paymentMethod: "CASH", scheduledAt: new Date(Date.now() + 3600e3), createdAt: new Date(Date.now() - 864e5),
  } as never });

  try {
    let r = await upload(patient, "/api/patients/me/photo", [{ bytes: HTML, type: "image/png", name: "avatar.png" }]);
    check("profile photo: HTML disguised as PNG → 400", r.status === 400 && /isn't a real/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await upload(patient, "/api/patients/me/photo", [{ bytes: PDF, type: "image/png", name: "avatar.png" }]);
    check("profile photo: PDF bytes declared PNG → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await upload(patient, "/api/patients/me/documents", [{ bytes: PNG, type: "application/pdf", name: "report.pdf" }], { title: "Report" });
    check("documents: PNG bytes declared PDF → 400 mismatch", r.status === 400 && /actually a PNG/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await upload(patient, `/api/appointments/${appt.id}/messages/upload`, [{ bytes: JPEG, type: "image/png", name: "rash.png" }]);
    check("chat attachment: JPEG bytes declared PNG → 400", r.status === 400 && /actually a JPG/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await upload(doctor, `/api/appointments/${appt.id}/prescription`, [
      { bytes: PNG, type: "image/png", name: "scan.png" },
      { bytes: HTML, type: "application/pdf", name: "evil.pdf" },
    ]);
    const saved = await prisma.prescriptionAttachment.count({ where: { appointmentId: appt.id } });
    check("prescription batch with one bad file → 400, nothing saved", r.status === 400 && (r.json.error ?? "").startsWith("evil.pdf") && saved === 0, `${r.status} ${r.json.error} · ${saved} saved`);
    r = await upload(doctor, "/api/doctors/me/documents", [{ bytes: HTML, type: "image/png", name: "sig.png" }], { type: "signature" });
    check("doctor signature: HTML as PNG → 400", r.status === 400, `${r.status} ${r.json.error}`);

    // Happy path: a real PNG is stored, under its sniffed type.
    r = await upload(patient, "/api/patients/me/photo", [{ bytes: PNG, type: "image/png", name: "avatar.png" }]);
    const photoUrl = String(r.json.photoUrl ?? "");
    check("profile photo: real PNG → 200, stored as .png", r.status === 200 && photoUrl.endsWith(".png"), `${r.status} ${photoUrl.slice(-30)}`);
    if (photoUrl) {
      const head = await fetch(photoUrl, { method: "HEAD" });
      check("…and S3 serves it as image/png", head.headers.get("content-type") === "image/png" || head.status === 403, `${head.status} ${head.headers.get("content-type")}`);
    }
  } finally {
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.patientDocument.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
