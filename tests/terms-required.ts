// Booking requires accepted Terms: POST /api/appointments and
// /api/nurse-bookings answer 409 TERMS_REQUIRED until termsAcceptedAt is set.
// Against a live dev server and the DB in .env, throwaway users only.
//
//   npm run test:terms
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const patient = await prisma.user.create({
    data: { name: "Terms Patient", mobile: `3${stamp}1`, role: "PATIENT", patientProfile: { create: { age: 30, gender: "Male" } } },
  });
  const cookie = `doconclick_token=${jwt.sign({ id: patient.id, name: patient.name, role: "PATIENT", mobile: patient.mobile, tv: 0 }, SECRET)}`;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    return { status: res.status, code: json.code ?? "", error: json.error ?? "" };
  };
  // Valid enough to reach the patient checks; the doctor/nurse ids are fake,
  // so once terms are accepted the request fails later, not on terms.
  const doctorBooking = { doctorId: "no-such-doctor", symptoms: "fever and cough", consultType: "VIDEO", consentGiven: true };
  const nurseBooking = { nurseId: "no-such-nurse", serviceId: "no-such-service", consentGiven: true };

  try {
    let r = await post("/api/appointments", doctorBooking);
    check("doctor booking without terms → 409 TERMS_REQUIRED", r.status === 409 && r.code === "TERMS_REQUIRED", `${r.status} ${r.code} ${r.error}`);
    r = await post("/api/nurse-bookings", nurseBooking);
    check("nurse booking without terms → 409 TERMS_REQUIRED", r.status === 409 && r.code === "TERMS_REQUIRED", `${r.status} ${r.code} ${r.error}`);

    const accepted = await fetch(`${BASE}/api/auth/accept-terms`, { method: "POST", headers: { Cookie: cookie } });
    check("accept-terms succeeds", accepted.ok, String(accepted.status));

    r = await post("/api/appointments", doctorBooking);
    check("doctor booking after accepting → past the terms check", r.code !== "TERMS_REQUIRED", `${r.status} ${r.code} ${r.error}`);
    r = await post("/api/nurse-bookings", nurseBooking);
    check("nurse booking after accepting → past the terms check", r.code !== "TERMS_REQUIRED", `${r.status} ${r.code} ${r.error}`);
  } finally {
    await prisma.user.deleteMany({ where: { id: patient.id } });
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
