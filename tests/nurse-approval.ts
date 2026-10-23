// Nurse approval checklist (BUG-TRACKER #52): APPROVED needs the council
// number, base location and every document — council certificate, degree,
// KYC, photo — with each file read back from S3 and sniffed, so the LIVE case
// (an HTML page saved as the KYC "image", from before uploads were checked)
// can't be approved. Against a live dev server, the DB and the S3 bucket in
// .env (test files are uploaded directly — as a pre-check upload would have
// been — and deleted afterwards), throwaway users only.
//
//   npm run test:nurse-approval   (run with the shell's AWS_* unset, so .env's are used)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../src/lib/prisma";
import { uploadToS3 } from "../src/lib/s3";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const HTML = Buffer.from("<!doctype html><html><body><script>alert(document.cookie)</script></body></html>");

type Item = { key: string; ok: boolean; problem: string | null };
type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const folder = `nurse-docs/test-approval-${stamp}`;
  const keys: string[] = [];
  const put = async (name: string, bytes: Buffer, type: string) => {
    const key = `${folder}/${name}`;
    keys.push(key);
    return uploadToS3(key, bytes, type);
  };
  const [pdf, png, jpeg, html] = await Promise.all([
    put("council.pdf", PDF, "application/pdf"),
    put("degree.png", PNG, "image/png"),
    put("photo.jpg", JPEG, "image/jpeg"),
    // The LIVE case: an HTML page stored as an image.
    put("kyc.png", HTML, "image/png"),
  ]);
  const missing = `${new URL(pdf).origin}/${folder}/does-not-exist.pdf`;

  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `2${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  const admin = await mk({ name: "Approval Admin", role: "ADMIN" });
  const complete = { councilRegNo: "MNC-12345", councilCertUrl: pdf, degreeCertUrl: png, kycDocUrl: pdf, photoUrl: jpeg, lat: 18.52, lng: 73.85 };
  const nurse = await mk({ name: "Approval Nurse", role: "NURSE", nurseProfile: { create: { status: "PENDING" } } });
  const setDocs = (data: Record<string, unknown>) => prisma.nurseProfile.update({ where: { userId: nurse.id }, data });
  const get = async () => {
    const res = await fetch(`${BASE}/api/admin/nurses/${nurse.id}`, { headers: { Cookie: cookieFor(admin) } });
    const j = (await res.json()) as { approvalChecklist?: { items: Item[]; ready: boolean } };
    return j.approvalChecklist!;
  };
  const approve = async () => {
    const res = await fetch(`${BASE}/api/admin/nurses/${nurse.id}`, {
      method: "PATCH", headers: { Cookie: cookieFor(admin), "Content-Type": "application/json" }, body: JSON.stringify({ status: "APPROVED" }),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as { error?: string; code?: string; status?: string; checklist?: { items: Item[] } } };
  };
  const problemOf = (items: Item[], key: string) => items.find((i) => i.key === key)?.problem ?? null;
  const failing = (items: Item[]) => items.filter((i) => !i.ok).map((i) => i.key).join(",");

  try {
    // ── Nothing provided ──
    let r = await approve();
    check("nothing provided → 400 APPROVAL_CHECKLIST listing all six", r.status === 400 && r.json.code === "APPROVAL_CHECKLIST" && r.json.checklist?.items.filter((i) => !i.ok).length === 6, `${r.status} ${failing(r.json.checklist?.items ?? [])}`);

    // ── The LIVE case: everything there, KYC is disguised HTML ──
    await setDocs({ ...complete, kycDocUrl: html });
    let c = await get();
    check("disguised-HTML KYC: only KYC fails, and says why", !c.ready && failing(c.items) === "kyc" && /Not a real PDF \/ JPG \/ PNG/.test(problemOf(c.items, "kyc") ?? ""), `${failing(c.items)} · ${problemOf(c.items, "kyc")}`);
    r = await approve();
    check("…approve → 400, nurse still PENDING", r.status === 400 && (r.json.error ?? "").includes("KYC") && (await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } })).status === "PENDING", `${r.status} ${r.json.error}`);

    // ── Other bad references ──
    await setDocs({ ...complete, kycDocUrl: "https://evil.example/aadhaar.pdf" });
    c = await get();
    check("KYC on another site → not one of our uploads", problemOf(c.items, "kyc") === "Not a file uploaded through the app", String(problemOf(c.items, "kyc")));
    await setDocs({ ...complete, kycDocUrl: missing });
    c = await get();
    check("KYC pointing at a missing object → 'missing', not 'try again'", (problemOf(c.items, "kyc") ?? "").includes("missing"), String(problemOf(c.items, "kyc")));
    await setDocs({ ...complete, photoUrl: pdf });
    c = await get();
    check("a PDF as the photo → photo fails (images only)", failing(c.items) === "photo" && /JPG \/ PNG/.test(problemOf(c.items, "photo") ?? ""), `${failing(c.items)} · ${problemOf(c.items, "photo")}`);
    await setDocs({ ...complete, degreeCertUrl: null });
    c = await get();
    check("no degree certificate → 'Not uploaded yet'", problemOf(c.items, "degreeCert") === "Not uploaded yet", String(problemOf(c.items, "degreeCert")));
    await setDocs({ ...complete, lat: null, lng: null });
    c = await get();
    check("no base location → fails (existing rule kept)", failing(c.items) === "location", failing(c.items));
    await setDocs({ ...complete, councilRegNo: null });
    c = await get();
    check("no council number → fails (existing rule kept)", failing(c.items) === "councilRegNo", failing(c.items));

    // ── All real ──
    await setDocs(complete);
    c = await get();
    check("everything real → checklist ready", c.ready && failing(c.items) === "", failing(c.items) || "ready");
    r = await approve();
    check("…approve → 200 APPROVED", r.status === 200 && r.json.status === "APPROVED", `${r.status} ${r.json.error ?? r.json.status}`);
    r = await approve();
    check("re-saving an approved nurse doesn't re-run the checks", r.status === 200, `${r.status}`);

    // ── P2-33: an approved nurse can't quietly change what was approved ──
    const as = (method: string, path: string, body: unknown) =>
      fetch(`${BASE}${path}`, { method, headers: { Cookie: cookieFor({ ...nurse, role: "NURSE" } as U), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const statusNow = async () => (await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } })).status;
    const reapprove = async () => { await setDocs({ ...complete, status: "APPROVED", isVerified: false }); };

    let res = await as("PATCH", "/api/nurses/me", { bio: "Updated bio", radius: 12 });
    check("approved nurse edits bio/radius → 200, stays APPROVED", res.status === 200 && (await statusNow()) === "APPROVED", `${res.status} ${await statusNow()}`);
    res = await as("PATCH", "/api/nurses/me", { lat: 18.5205, lng: 73.8505 });
    check("base moved <2 km → 200, stays APPROVED", res.status === 200 && (await statusNow()) === "APPROVED", `${res.status} ${await statusNow()}`);
    res = await as("PATCH", "/api/nurses/me", { lat: 18.62, lng: 73.95 });
    check("base moved >2 km → 200, back to PENDING", res.status === 200 && (await statusNow()) === "PENDING", `${res.status} ${await statusNow()}`);
    await reapprove();
    res = await as("PATCH", "/api/nurses/me", { councilRegNo: "FAKE-9999" });
    check("approved nurse changes councilRegNo → PENDING", res.status === 200 && (await statusNow()) === "PENDING", `${res.status} ${await statusNow()}`);
    await reapprove();
    res = await as("PATCH", "/api/nurses/me", { councilRegNo: complete.councilRegNo });
    check("same councilRegNo re-saved → stays APPROVED", res.status === 200 && (await statusNow()) === "APPROVED", `${res.status} ${await statusNow()}`);
    res = await as("DELETE", "/api/nurses/me/documents", { type: "photo" });
    check("approved nurse removes the photo → stays APPROVED", res.status === 200 && (await statusNow()) === "APPROVED", `${res.status} ${await statusNow()}`);
    res = await as("DELETE", "/api/nurses/me/documents", { type: "degreeCert" });
    const afterDel = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } });
    check("approved nurse deletes degreeCert → PENDING", res.status === 200 && afterDel.status === "PENDING" && afterDel.degreeCertUrl === null, `${res.status} ${afterDel.status}`);

    // ── Admin: isVerified needs APPROVED + a ready checklist ──
    const verify = async (body: unknown) => {
      const rv = await fetch(`${BASE}/api/admin/nurses/${nurse.id}`, { method: "PATCH", headers: { Cookie: cookieFor(admin), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return rv.status;
    };
    await setDocs({ ...complete, status: "PENDING", isVerified: false });
    let st = await verify({ isVerified: true });
    check("PENDING nurse isVerified:true → 400", st === 400 && !(await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } })).isVerified, `${st}`);
    await setDocs({ ...complete, status: "APPROVED", degreeCertUrl: null });
    st = await verify({ isVerified: true });
    check("APPROVED but checklist incomplete → 400", st === 400, `${st}`);
    await setDocs({ ...complete, status: "APPROVED" });
    st = await verify({ isVerified: true });
    check("APPROVED + checklist ready → 200 verified", st === 200 && (await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: nurse.id } })).isVerified, `${st}`);
    res = await as("PATCH", "/api/nurses/me", { councilRegNo: "OTHER-1234" });
    check("verified nurse changing councilRegNo → still 403", res.status === 403, `${res.status}`);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    const s3 = new S3Client({ region: process.env.AWS_REGION!, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } });
    await Promise.all(keys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key })).catch(() => {})));
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
