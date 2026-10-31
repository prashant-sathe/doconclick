// Symptom photos on a doctor booking: the patient uploads photos into their
// vault (POST /api/patients/me/documents, real S3 upload), then books with
// symptomPhotoIds; the doctor's feed shows them. Only the patient's own
// image documents, at most 3. Against a live dev server and the DB in .env,
// throwaway users only; uploaded objects are deleted afterwards.
//
//   npm run test:symptom-photos
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { deleteFromS3 } from "../src/lib/s3";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 24 * 60 * 60_000;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function call(u: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Cookie: cookieFor(u), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; id?: string };
  return { status: res.status, json };
}
async function upload(u: U, bytes: Buffer, type: string, name: string) {
  const fd = new FormData();
  fd.append("title", "Symptom photo");
  fd.append("category", "Other");
  fd.append("file", new File([new Uint8Array(bytes)], name, { type }));
  const res = await fetch(`${BASE}/api/patients/me/documents`, { method: "POST", headers: { Cookie: cookieFor(u) }, body: fd });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as { id?: string; fileUrl?: string; error?: string } };
}

// A real photo-sized JPEG (rendered by macOS `sips` from a system image),
// not a hand-made few-byte stub.
function realJpeg(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "symptom-photo-"));
  const out = join(dir, "rash.jpg");
  execFileSync("sips", ["-s", "format", "jpeg", "-z", "1600", "1200", "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/AlertStopIcon.icns", "--out", out], { stdio: "ignore" });
  return readFileSync(out);
}
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: data as never });
    ids.push(u.id);
    return u;
  };
  const patient = (n: number) => mk({
    name: `Photo Patient ${n}`, mobile: `4${stamp}${n}`, role: "PATIENT", termsAcceptedAt: new Date(),
    patientProfile: { create: { age: 30, gender: "Female" } },
  });
  const doctor = await mk({
    name: "Photo Doctor", mobile: `4${stamp}9`, role: "DOCTOR",
    doctorProfile: {
      create: {
        status: "APPROVED", isVerified: true, trialEndsAt: new Date(Date.now() + 30 * DAY),
        offersVideo: true, videoFee: 300, availability: "Mon-Sun, 12AM-11:59PM",
      },
    },
  });
  const p1 = await patient(1);
  const p2 = await patient(2);
  const book = (u: U, symptomPhotoIds?: unknown) =>
    call(u, "POST", "/api/appointments", { doctorId: doctor.id, symptoms: "itchy rash on arm", consultType: "VIDEO", consentGiven: true, symptomPhotoIds });

  try {
    const jpeg = realJpeg();
    // One at a time, like the form — the feed orders photos by upload time.
    const up = [];
    for (let i = 0; i < 4; i++) up.push(await upload(p1, jpeg, "image/jpeg", "rash.jpg"));
    check(`4 real JPEG uploads (${Math.round(jpeg.length / 1024)} KB) → 200`, up.every((r) => r.status === 200 && r.json.id), up.map((r) => r.status).join(","));
    const photoIds = up.map((r) => r.json.id!);
    const head = await fetch(up[0].json.fileUrl!);
    check("uploaded photo is reachable on S3", head.ok && (head.headers.get("content-type") ?? "").startsWith("image/jpeg"), `${head.status} ${head.headers.get("content-type")}`);

    const pdf = await upload(p1, PDF, "application/pdf", "report.pdf");
    const other = await upload(p2, jpeg, "image/jpeg", "theirs.jpg");

    let r = await book(p1, photoIds);
    check("4 photos → 400", r.status === 400 && /at most 3 photos/.test(r.json.error ?? ""), `${r.status} ${r.json.error}`);
    r = await book(p1, [photoIds[0], other.json.id]);
    check("another patient's photo → 400", r.status === 400, `${r.status} ${r.json.error}`);
    r = await book(p1, [pdf.json.id]);
    check("a PDF document as a photo → 400", r.status === 400, `${r.status} ${r.json.error}`);
    check("rejected bookings created nothing", (await prisma.appointment.count({ where: { patientId: p1.id } })) === 0, "0 rows");

    r = await book(p1, photoIds.slice(0, 2));
    const withPhotos = r.json.id;
    check("2 own photos → booked", r.status === 200 && !!withPhotos, `${r.status} ${r.json.error ?? ""}`);
    r = await book(p2);
    check("no photos (field omitted) → booked", r.status === 200, `${r.status} ${r.json.error ?? ""}`);

    const feed = await call(doctor, "GET", "/api/appointments/me");
    const list = (Array.isArray(feed.json) ? feed.json : (feed.json.appointments as unknown[])) as { id: string; symptomPhotos?: { id: string; fileUrl: string }[] }[];
    const mine = list.find((a) => a.id === withPhotos);
    check("doctor feed lists the 2 photos in order", JSON.stringify(mine?.symptomPhotos?.map((p) => p.id)) === JSON.stringify(photoIds.slice(0, 2)), JSON.stringify(mine?.symptomPhotos?.map((p) => p.id)));
    check("a booking without photos has an empty list", list.filter((a) => a.id !== withPhotos).every((a) => a.symptomPhotos?.length === 0), "ok");
  } finally {
    const docs = await prisma.patientDocument.findMany({ where: { patientId: { in: ids } }, include: { patient: { select: { name: true } } } });
    for (const d of docs) await deleteFromS3(d.fileUrl, "patient-documents");
    await prisma.appointment.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { doctorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
