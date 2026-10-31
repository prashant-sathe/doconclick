// Admin announcements (BUG-TRACKER P3-46): announcement create/edit routes
// properly handle malformed JSON (400, not 500), and the GET response includes
// recipientCount (live users matching the audience) so the send confirm dialog
// can show "This will be sent to N users." Pure checks for bad JSON parsing,
// then against a live dev server and the DB in .env.
//
//   npm run test:announcements
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { audienceToRoles } from "../src/lib/announcements";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
type J = Record<string, unknown> & { error?: string; recipientCount?: number };
const tokenFor = (u: U) => jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET);
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
const as = (u: U) => `doconclick_token=${tokenFor(u)}`;

async function main() {
  console.log("Testing admin announcements (P3-46)...\n");

  // ── audienceToRoles helper ──
  check("audienceToRoles: PATIENT → [PATIENT]", JSON.stringify(audienceToRoles("PATIENT")) === '["PATIENT"]', "ok");
  check("audienceToRoles: DOCTOR → [DOCTOR]", JSON.stringify(audienceToRoles("DOCTOR")) === '["DOCTOR"]', "ok");
  check("audienceToRoles: BOTH → [DOCTOR,PATIENT]", JSON.stringify(audienceToRoles("BOTH")) === '["DOCTOR","PATIENT"]', "ok");

  // ── Fixtures ──
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `6${stamp}${n++}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };

  const admin = await mk({ name: "Announcement Admin", role: "ADMIN" });
  await mk({ name: "Patient One", role: "PATIENT", patientProfile: { create: { age: 30, gender: "M" } } });
  await mk({ name: "Patient Two", role: "PATIENT", patientProfile: { create: { age: 25, gender: "F" } } });
  await mk({ name: "Doctor Test", role: "DOCTOR", doctorProfile: { create: { status: "PENDING", registrationFeePaid: false } } });

  const adminCookie = as(admin);
  let announcementId: string | null = null;

  try {
    // ── Bad JSON handling ──
    console.log("\nTesting bad JSON handling:\n");

    // POST with malformed JSON
    const postBadJson = await call(adminCookie, "POST", "/api/admin/announcements", "{invalid json}");
    check("POST announcements with malformed JSON → 400", postBadJson.status === 400, `status ${postBadJson.status}`);
    check("POST error message mentions JSON object", !!postBadJson.json.error?.includes("JSON object"), postBadJson.json.error ?? "no error field");

    // POST with array (not an object)
    const postArray = await call(adminCookie, "POST", "/api/admin/announcements", '["not","an","object"]');
    check("POST announcements with array body → 400", postArray.status === 400, `status ${postArray.status}`);

    // POST with null
    const postNull = await call(adminCookie, "POST", "/api/admin/announcements", 'null');
    check("POST announcements with null → 400", postNull.status === 400, `status ${postNull.status}`);

    // ── Create a valid draft ──
    console.log("\nCreating a valid draft announcement:\n");

    const create = await call(adminCookie, "POST", "/api/admin/announcements", {
      title: "Test P3-46",
      message: "Testing recipient count feature",
      audience: "PATIENT"
    });
    check("Create valid draft → 201/200", create.status >= 200 && create.status < 300, `status ${create.status}`);
    announcementId = (create.json as { id?: string }).id ?? null;
    check("Created announcement has an id", !!announcementId, announcementId ?? "no id");

    if (!announcementId) {
      console.error("\n✗ Could not create test announcement, stopping.");
      process.exit(1);
    }

    // ── GET with recipientCount ──
    console.log("\nTesting recipientCount in GET response:\n");

    const get = await call(adminCookie, "GET", `/api/admin/announcements/${announcementId}`);
    check("GET announcement → 200", get.status === 200, `status ${get.status}`);
    check("GET response includes recipientCount field", typeof get.json.recipientCount === "number", `recipientCount: ${get.json.recipientCount}`);

    // We have 2 live PATIENT users (patient1, patient2), so recipientCount for PATIENT audience should be >= 2
    const actualCount = get.json.recipientCount ?? -1;
    check("recipientCount for PATIENT audience >= 2", actualCount >= 2, `count: ${actualCount}`);

    // ── Bad JSON on PATCH ──
    console.log("\nTesting bad JSON handling on PATCH:\n");

    const patchBadJson = await call(adminCookie, "PATCH", `/api/admin/announcements/${announcementId}`, "{invalid}");
    check("PATCH with malformed JSON → 400", patchBadJson.status === 400, `status ${patchBadJson.status}`);
    check("PATCH error message mentions JSON object", !!patchBadJson.json.error?.includes("JSON object"), patchBadJson.json.error ?? "no error field");

    const patchNull = await call(adminCookie, "PATCH", `/api/admin/announcements/${announcementId}`, 'null');
    check("PATCH with null → 400", patchNull.status === 400, `status ${patchNull.status}`);

    // ── Valid PATCH and verify recipientCount updates ──
    console.log("\nTesting valid PATCH:\n");

    const patch = await call(adminCookie, "PATCH", `/api/admin/announcements/${announcementId}`, {
      title: "Updated Test P3-46"
    });
    check("Valid PATCH → 200", patch.status === 200, `status ${patch.status}`);

    // Get again to verify recipientCount is still there
    const getAfterPatch = await call(adminCookie, "GET", `/api/admin/announcements/${announcementId}`);
    check("GET after PATCH still includes recipientCount", typeof getAfterPatch.json.recipientCount === "number", `recipientCount: ${getAfterPatch.json.recipientCount}`);

  } finally {
    // ── Cleanup ──
    console.log("\nCleaning up:\n");

    if (announcementId) {
      const del = await call(adminCookie, "DELETE", `/api/admin/announcements/${announcementId}`);
      check("Delete test announcement", del.status === 200, `status ${del.status}`);
    }

    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`✓ Deleted ${ids.length} test users`);
  }

  console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ All checks passed"}`);
  process.exit(failures);
}

main();
