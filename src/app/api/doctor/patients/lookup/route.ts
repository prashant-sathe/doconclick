import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { normalizeMobile, MOBILE_REGEX } from "@/lib/validation";
import { createRateLimiter } from "@/lib/rateLimit";

// A front desk looks up a handful of patients an hour; this stops anyone
// walking the number space to find out who has an account.
const checkLimit = createRateLimiter(60, 10 * 60_000);

// GET ?mobile= — the walk-in form's first step (/doctor/walk-in): is this
// number already a patient (book under their account, offer their family
// members), new (an account is created with the booking), or someone who
// can't be booked as a patient (a doctor/nurse/staff/admin number).
export async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await resolveDoctorScope(authUser);
  if (scope.denied) return scope.denied;

  if (!checkLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many lookups. Please wait a few minutes and try again." }, { status: 429 });
  }

  const mobile = normalizeMobile(new URL(req.url).searchParams.get("mobile") ?? "");
  if (!MOBILE_REGEX.test(mobile)) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { mobile },
    select: {
      id: true,
      name: true,
      role: true,
      deletedAt: true,
      patientProfile: {
        select: {
          age: true,
          gender: true,
          allergies: true,
          homeAddress: true,
          landmark: true,
          pinCode: true,
          dependents: { select: { id: true, name: true, relation: true, age: true, gender: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!user || user.deletedAt) return NextResponse.json({ exists: false, mobile });
  if (user.role !== "PATIENT" || !user.patientProfile) {
    return NextResponse.json(
      { error: "This number belongs to a non-patient DocOnClick account, so it can't be booked as a patient. Use another number.", code: "NOT_A_PATIENT" },
      { status: 409 }
    );
  }

  const [booked, visits, last] = await Promise.all([
    prisma.appointment.count({ where: { doctorId: scope.doctorId, patientId: user.id } }),
    prisma.appointment.count({ where: { doctorId: scope.doctorId, patientId: user.id, status: "COMPLETED" } }),
    prisma.appointment.findFirst({
      where: { doctorId: scope.doctorId, patientId: user.id, status: "COMPLETED" },
      orderBy: { scheduledAt: "desc" },
      select: { scheduledAt: true },
    }),
  ]);
  const p = user.patientProfile;
  // Only someone who has booked this doctor before is "their" patient: for
  // anyone else a mobile number reveals just the name (to confirm it's the
  // right person), not their address, allergies or family. A new family
  // member typed in for them is matched to an existing one by name.
  const known = booked > 0;
  return NextResponse.json({
    exists: true,
    mobile,
    patient: {
      id: user.id,
      name: user.name,
      // "Not filled" placeholders (quick signup) come back as null.
      age: p.age > 0 ? p.age : null,
      gender: p.gender || null,
      known,
      allergies: known ? p.allergies : null,
      homeAddress: known ? p.homeAddress : null,
      landmark: known ? p.landmark : null,
      pinCode: known ? p.pinCode : null,
      dependents: known ? p.dependents : [],
      visitsWithDoctor: visits,
      lastVisitAt: last?.scheduledAt ?? null,
    },
  });
}
