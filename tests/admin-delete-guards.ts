// Admin patient/doctor routes act only on live users of their own role
// (BUG-TRACKER #11). Runs against a live dev server (npm run dev) and the DB
// in .env. Real accounts are only ever read (GET); every DELETE/PATCH targets
// throwaway users that are removed afterwards.
//
//   npm run test:admin-delete            (BASE_URL defaults to http://localhost:3000)
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
  const stamp = String(Date.now()).slice(-9);
  const caller = await prisma.user.create({ data: { name: "Guard Test Admin", mobile: "4" + stamp, role: "ADMIN" } });
  const otherAdmin = await prisma.user.create({ data: { name: "Guard Test Admin 2", mobile: "3" + stamp, role: "ADMIN" } });
  const patient = await prisma.user.create({ data: { name: "Guard Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  const racer = await prisma.user.create({ data: { name: "Guard Test Racer", mobile: "7" + stamp, role: "PATIENT" } });
  const doctor = await prisma.user.create({ data: { name: "Guard Test Doctor", mobile: "9" + stamp, role: "DOCTOR", doctorProfile: { create: { status: "APPROVED" } } } });
  const ids = [caller, otherAdmin, patient, racer, doctor].map((u) => u.id);

  const cookie = `doconclick_token=${jwt.sign({ id: caller.id, name: caller.name, role: "ADMIN", mobile: caller.mobile, tv: 0 }, SECRET)}`;
  const call = async (path: string, method = "GET", body?: unknown) =>
    (await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })).status;
  const live = async (id: string) => !!(await prisma.user.findFirst({ where: { id, deletedAt: null } }));

  try {
    // ── Read-only checks against real accounts ──
    const realAdmin = await prisma.user.findFirst({ where: { role: "ADMIN", deletedAt: null, id: { notIn: ids } } });
    const realPatient = await prisma.user.findFirst({ where: { role: "PATIENT", deletedAt: null, id: { notIn: ids } } });
    const realDoctor = await prisma.user.findFirst({ where: { role: "DOCTOR", deletedAt: null, id: { notIn: ids } } });
    const realDeleted = await prisma.user.findFirst({ where: { deletedAt: { not: null } } });
    if (realAdmin) {
      check("GET real admin via patients route", (await call(`/api/admin/patients/${realAdmin.id}`)) === 404, "404");
      check("GET real admin via doctors route", (await call(`/api/admin/doctors/${realAdmin.id}`)) === 404, "404");
    }
    if (realDoctor) check("GET real doctor via patients route", (await call(`/api/admin/patients/${realDoctor.id}`)) === 404, "404");
    if (realPatient) check("GET real patient via doctors route", (await call(`/api/admin/doctors/${realPatient.id}`)) === 404, "404");
    if (realDeleted) {
      check("GET deleted user via patients route", (await call(`/api/admin/patients/${realDeleted.id}`)) === 404, "404");
      check("GET deleted user via doctors route", (await call(`/api/admin/doctors/${realDeleted.id}`)) === 404, "404");
    }
    if (realPatient) check("GET real patient via patients route", (await call(`/api/admin/patients/${realPatient.id}`)) === 200, "still works");
    if (realDoctor) check("GET real doctor via doctors route", (await call(`/api/admin/doctors/${realDoctor.id}`)) === 200, "still works");

    // ── Writes, throwaway users only ──
    let s = await call(`/api/admin/patients/${otherAdmin.id}`, "DELETE");
    check("DELETE admin via patients route", s === 404 && (await live(otherAdmin.id)), `${s}, admin still live`);
    s = await call(`/api/admin/doctors/${otherAdmin.id}`, "DELETE");
    check("DELETE admin via doctors route", s === 404 && (await live(otherAdmin.id)), `${s}, admin still live`);
    s = await call(`/api/admin/doctors/${otherAdmin.id}`, "PATCH", { status: "SUSPENDED" });
    check("PATCH admin via doctors route", s === 404, `${s}`);
    s = await call(`/api/admin/doctors/${patient.id}`, "DELETE");
    check("DELETE patient via doctors route", s === 404 && (await live(patient.id)), `${s}, patient still live`);
    s = await call(`/api/admin/patients/${doctor.id}`, "DELETE");
    check("DELETE doctor via patients route", s === 404 && (await live(doctor.id)), `${s}, doctor still live`);

    s = await call(`/api/admin/patients/${patient.id}`, "DELETE");
    const once = await prisma.user.findUniqueOrThrow({ where: { id: patient.id } });
    check("DELETE patient via patients route", s === 200 && !!once.deletedAt, `${s}`);
    s = await call(`/api/admin/patients/${patient.id}`, "DELETE");
    const twice = await prisma.user.findUniqueOrThrow({ where: { id: patient.id } });
    check("re-DELETE already deleted patient", s === 404 && twice.mobile === once.mobile, `${s}, mobile ${twice.mobile === once.mobile ? "unchanged" : "RE-PREFIXED"}`);

    s = await call(`/api/admin/doctors/${doctor.id}`, "DELETE");
    check("DELETE doctor via doctors route", s === 200, `${s}`);
    s = await call(`/api/admin/doctors/${doctor.id}`, "PATCH", { status: "APPROVED" });
    check("PATCH deleted doctor", s === 404, `${s}`);

    const statuses = await Promise.all(Array.from({ length: 6 }, () => call(`/api/admin/patients/${racer.id}`, "DELETE")));
    const raced = await prisma.user.findUniqueOrThrow({ where: { id: racer.id } });
    check(
      "6 concurrent DELETEs",
      statuses.filter((x) => x === 200).length === 1 && (raced.mobile.match(/deleted_/g) ?? []).length === 1,
      `${statuses.join(",")}; mobile ${raced.mobile}`,
    );
  } finally {
    await prisma.doctorProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: ids } } });
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
