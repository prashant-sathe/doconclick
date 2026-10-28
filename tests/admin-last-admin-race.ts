// Test the atomic last-admin guard: when two admins try to delete each other
// simultaneously, at most one DELETE should succeed (BUG-TRACKER #P2-41).
// Runs against a live dev server (port 3230) and the DB in .env.
//
//   npm run test:admin-last-admin-race
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { deleteAccount } from "../src/lib/userDeletion";
import { lastAdminGuard } from "../src/lib/adminAuth";
import type { Prisma } from "../src/generated/prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3230";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-9);

  const call = async (cookie: string, targetId: string) => {
    const res = await fetch(`${BASE}/api/admin/admins/${targetId}`, {
      method: "DELETE",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  const live = async (id: string) => {
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    return !!user;
  };

  const countLiveAdmins = async () => {
    return await prisma.user.count({ where: { role: "ADMIN", deletedAt: null } });
  };

  try {
    // ── Direct race test (no HTTP) ──
    console.log("=== Direct race test (scoped guard) ===");

    // Run the race multiple times for confidence
    for (let run = 1; run <= 5; run++) {
      const adminE = await prisma.user.create({
        data: { name: `Direct Test E${run}`, mobile: "5" + stamp + run + "e", role: "ADMIN" },
      });
      const adminF = await prisma.user.create({
        data: { name: `Direct Test F${run}`, mobile: "5" + stamp + run + "f", role: "ADMIN" },
      });
      const scope = { id: { in: [adminE.id, adminF.id] } };

      // Both try to delete each other with guards scoped to only count these two
      const [resultE, resultF] = await Promise.all([
        deleteAccount(adminE.id, "ADMIN", { guard: lastAdminGuard(scope) }),
        deleteAccount(adminF.id, "ADMIN", { guard: lastAdminGuard(scope) }),
      ]);

      const eLive = await live(adminE.id);
      const fLive = await live(adminF.id);

      // Exactly one should succeed (return user), one should be refused (return { refused })
      const eSuccess = resultE && !("refused" in resultE);
      const fSuccess = resultF && !("refused" in resultF);
      const successCount = [eSuccess, fSuccess].filter(Boolean).length;

      check(
        `Run ${run}: Exactly one succeeds`,
        successCount === 1,
        `E: ${eSuccess ? "user" : "refused"}, F: ${fSuccess ? "user" : "refused"}`
      );

      check(
        `Run ${run}: Exactly one remains live`,
        (eLive && !fLive) || (!eLive && fLive),
        `E live: ${eLive}, F live: ${fLive}`
      );

      // Cleanup
      await prisma.user.deleteMany({ where: { id: { in: [adminE.id, adminF.id] } } });
    }

    // ── Negative control: no lock allows both deletes ──
    console.log("\n=== Negative control (no lock) ===");
    const adminG = await prisma.user.create({
      data: { name: "Control Test G", mobile: "6" + stamp + "g", role: "ADMIN" },
    });
    const adminH = await prisma.user.create({
      data: { name: "Control Test H", mobile: "6" + stamp + "h", role: "ADMIN" },
    });
    const controlScope = { id: { in: [adminG.id, adminH.id] } };

    // Guard that counts but takes no lock
    const unlocked = async (tx: Prisma.TransactionClient) => {
      const count = await tx.user.count({ where: { role: "ADMIN", deletedAt: null, ...controlScope } });
      if (count <= 1) return { error: "Last admin", status: 400 };
      return null;
    };

    const [resultG, resultH] = await Promise.all([
      deleteAccount(adminG.id, "ADMIN", { guard: unlocked }),
      deleteAccount(adminH.id, "ADMIN", { guard: unlocked }),
    ]);

    const gLive = await live(adminG.id);
    const hLive = await live(adminH.id);

    // Without the lock, both can succeed (flaky race, but demonstrates the lock matters)
    console.log(
      `Control: G ${resultG && !("refused" in resultG) ? "deleted" : "refused"}, ` +
      `H ${resultH && !("refused" in resultH) ? "deleted" : "refused"}; ` +
      `G live: ${gLive}, H live: ${hLive}`
    );
    console.log("(Note: Without the lock, this race is non-deterministic — both may delete)");

    // Cleanup
    await prisma.user.deleteMany({ where: { id: { in: [adminG.id, adminH.id] } } });

    // ── HTTP tests (session revocation) ──
    console.log("\n=== HTTP tests ===");
    const adminA = await prisma.user.create({
      data: { name: "HTTP Test A", mobile: "8" + stamp, role: "ADMIN" },
    });
    const adminB = await prisma.user.create({
      data: { name: "HTTP Test B", mobile: "9" + stamp, role: "ADMIN" },
    });

    const cookieA = `doconclick_token=${jwt.sign(
      { id: adminA.id, name: adminA.name, role: "ADMIN", mobile: adminA.mobile, tv: 0 },
      SECRET
    )}`;

    // Self-delete blocked
    const selfDelete = await call(cookieA, adminA.id);
    check("HTTP: Admin can't delete their own account", selfDelete.status === 400, `status ${selfDelete.status}`);

    // Serial delete works (first succeeds, second can't use revoked session)
    const del1 = await call(cookieA, adminB.id);
    check(
      "HTTP: First serial delete succeeds",
      del1.status === 200 && !(await live(adminB.id)),
      `status ${del1.status}, B deleted: ${!(await live(adminB.id))}`
    );

    // Cleanup
    await prisma.user.deleteMany({ where: { id: { in: [adminA.id, adminB.id] } } });

    // HTTP parallel race
    const adminC = await prisma.user.create({
      data: { name: "HTTP Race C", mobile: "7" + stamp + "c", role: "ADMIN" },
    });
    const adminD = await prisma.user.create({
      data: { name: "HTTP Race D", mobile: "7" + stamp + "d", role: "ADMIN" },
    });

    const cookieC = `doconclick_token=${jwt.sign(
      { id: adminC.id, name: adminC.name, role: "ADMIN", mobile: adminC.mobile, tv: 0 },
      SECRET
    )}`;
    const cookieD = `doconclick_token=${jwt.sign(
      { id: adminD.id, name: adminD.name, role: "ADMIN", mobile: adminD.mobile, tv: 0 },
      SECRET
    )}`;

    const [resultCD, resultDC] = await Promise.all([
      call(cookieC, adminD.id),
      call(cookieD, adminC.id),
    ]);

    const afterHttpRace = await countLiveAdmins();

    // With other admins in the DB, both can succeed (200, 200) or one can revoke
    // the other's session (200, 401). Either is valid; the guard only blocks when
    // deleting the last admin.
    check(
      "HTTP: Each DELETE returns 200 or 401",
      [200, 401].includes(resultCD.status) && [200, 401].includes(resultDC.status),
      `statuses: ${resultCD.status}, ${resultDC.status}`
    );

    check(
      "HTTP: System never locks out all admins",
      afterHttpRace >= 1,
      `global admin count after: ${afterHttpRace}`
    );

    // Cleanup
    await prisma.user.deleteMany({ where: { id: { in: [adminC.id, adminD.id] } } });

  } catch (error) {
    console.error("Test error:", error);
    failures++;
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
