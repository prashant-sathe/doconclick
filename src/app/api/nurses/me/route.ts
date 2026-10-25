import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveNurse, isNurseBookable } from "@/lib/providerGuard";
import { parseBody, definedOnly, nurseProfilePatchSchema } from "@/lib/schemas";
import { withErrorLocale } from "@/lib/apiErrors";
import { RE_REVIEW_FIELDS, baseLocationMovedFar, notifyAdminNurseReReview } from "@/lib/nurseReReview";

// GET: the logged-in nurse's own profile, offered services, and the
// admin-set fees (so the client knows whether a payment step applies).
export const GET = withErrorLocale(async function GET() {
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
});

// Credentials the admin verified against — frozen once verified.
const LOCKED_WHEN_VERIFIED = ["qualification", "councilRegNo", "councilState"];

// PATCH: update the logged-in nurse's own profile
export const PATCH = withErrorLocale(async function PATCH(req: Request) {
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

  // Approved nurse changing credentials or moving her base far → back to
  // PENDING for re-review (and the admin is told).
  const changed = (k: string) => k in data && data[k] !== (profile as Record<string, unknown>)[k];
  const reReview =
    profile.status === "APPROVED" &&
    (RE_REVIEW_FIELDS.some(changed) ||
      baseLocationMovedFar(profile, { lat: data.lat as number | null | undefined, lng: data.lng as number | null | undefined }));

  try {
    // Other fields never touch status. The APPROVED -> PENDING flip is a
    // conditional write so a concurrent admin SUSPENDED/REJECTED is not overwritten.
    const [updated, flipped] = await prisma.$transaction(async (tx) => {
      await tx.nurseProfile.update({ where: { userId: authUser.id }, data });
      const f = reReview
        ? await tx.nurseProfile.updateMany({ where: { userId: authUser.id, status: "APPROVED" }, data: { status: "PENDING" } })
        : { count: 0 };
      return [await tx.nurseProfile.findUniqueOrThrow({ where: { userId: authUser.id } }), f.count === 1] as const;
    });
    if (flipped) notifyAdminNurseReReview(authUser.name);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This council registration number is already in use." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }
});
