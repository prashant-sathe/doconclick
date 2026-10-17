import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveNurse, isNurseBookable } from "@/lib/providerGuard";
import { NURSE_QUALIFICATIONS } from "@/lib/nurseConstants";
import { GENDERS } from "@/lib/bookingProfile";

// GET: the logged-in nurse's own profile, offered services, and the
// admin-set fees (so the client knows whether a payment step applies).
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = await requireActiveNurse(authUser);
  if (denied) return denied;

  const [nurse, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        nurseProfile: {
          include: { services: { include: { service: true } } },
        },
      },
    }),
    prisma.platformSettings.findFirst(),
  ]);
  if (!nurse?.nurseProfile) {
    return NextResponse.json({ error: "Nurse not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...nurse,
    fees: {
      registrationFee: settings?.nurseRegistrationFee ?? 0,
      subscriptionFee: settings?.nurseSubscriptionFee ?? 0,
    },
    bookable: isNurseBookable(nurse.nurseProfile, settings),
  });
}

const TEXT_FIELDS = ["councilRegNo", "councilState", "languages", "bio", "address", "availability", "bankDetails"] as const;
// Credentials the admin verified against — frozen once verified.
const LOCKED_WHEN_VERIFIED = ["qualification", "councilRegNo", "councilState"];

// PATCH: update the logged-in nurse's own profile
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = await requireActiveNurse(authUser);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const profile = await prisma.nurseProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) return NextResponse.json({ error: "Nurse not found" }, { status: 404 });

  if (profile.isVerified && LOCKED_WHEN_VERIFIED.some((k) => k in body && body[k] !== (profile as Record<string, unknown>)[k])) {
    return NextResponse.json(
      { error: "Your credentials are already verified — qualification and council registration can no longer be changed." },
      { status: 403 }
    );
  }

  const data: Record<string, string | number | null> = {};
  for (const key of TEXT_FIELDS) {
    if (!(key in body)) continue;
    const value = String(body[key] ?? "").trim();
    data[key] = value ? value.slice(0, 1000) : null;
  }
  if ("councilRegNo" in data && data.councilRegNo) data.councilRegNo = String(data.councilRegNo).toUpperCase();

  if ("qualification" in body) {
    if (body.qualification && !(NURSE_QUALIFICATIONS as readonly string[]).includes(body.qualification)) {
      return NextResponse.json({ error: "Select a valid qualification." }, { status: 400 });
    }
    data.qualification = body.qualification || null;
  }
  if ("gender" in body) {
    if (body.gender && !(GENDERS as readonly string[]).includes(body.gender)) {
      return NextResponse.json({ error: "Select a gender." }, { status: 400 });
    }
    data.gender = body.gender || null;
  }
  if ("experience" in body) {
    const n = Number(body.experience);
    if (!Number.isInteger(n) || n < 0 || n > 60) {
      return NextResponse.json({ error: "Experience must be between 0 and 60 years." }, { status: 400 });
    }
    data.experience = n;
  }
  if ("radius" in body) {
    data.radius = Math.min(30, Math.max(1, Math.round(Number(body.radius)) || 10));
  }
  for (const key of ["lat", "lng"] as const) {
    if (!(key in body)) continue;
    const n = body[key] === "" || body[key] == null ? null : Number(body[key]);
    if (n != null && !Number.isFinite(n)) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
    data[key] = n;
  }

  try {
    const updated = await prisma.nurseProfile.update({ where: { userId: authUser.id }, data });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This council registration number is already in use." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }
}
