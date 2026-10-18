import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveNurse, isNurseBookable } from "@/lib/providerGuard";
import { parseBody, definedOnly, nurseProfilePatchSchema } from "@/lib/schemas";

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

  const parsed = parseBody(nurseProfilePatchSchema, await req.json().catch(() => null));
  if (parsed.response) return parsed.response;
  const data: Record<string, string | number | null> = definedOnly(parsed.data);

  const profile = await prisma.nurseProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) return NextResponse.json({ error: "Nurse not found" }, { status: 404 });

  if (profile.isVerified && LOCKED_WHEN_VERIFIED.some((k) => k in data && data[k] !== (profile as Record<string, unknown>)[k])) {
    return NextResponse.json(
      { error: "Your credentials are already verified — qualification and council registration can no longer be changed." },
      { status: 403 }
    );
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
