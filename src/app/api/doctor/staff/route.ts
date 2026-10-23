import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";
import { validateRegistration } from "@/lib/validation";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { createRateLimiter } from "@/lib/rateLimit";
import { Prisma } from "@/generated/prisma/client";
import { withErrorLocale } from "@/lib/apiErrors";

// One message for "that number is taken" whoever owns it (a patient, another
// doctor's receptionist, a doctor), so the staff form can't be used to find
// out who has an account. Attempts are rate-limited for the same reason.
const MOBILE_UNAVAILABLE = "This mobile number can't be used for a staff account. Please use a different number.";
const createLimiter = createRateLimiter(10, 60 * 60_000); // per doctor, per hour

// GET: the logged-in doctor's own staff/receptionist accounts
export const GET = withErrorLocale(async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  // Listing stays open without a plan, so an expired doctor can still revoke access.
  const denied = await requireActiveDoctor(authUser);
  if (denied) return denied;

  const staff = await prisma.staffProfile.findMany({
    // Deleted staff are gone from the list (their account is anonymised).
    where: { doctorId: authUser.id, user: { deletedAt: null } },
    include: { user: { select: { id: true, name: true, mobile: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    staff.map((s) => ({
      staffProfileId: s.id,
      userId: s.user.id,
      name: s.user.name,
      mobile: s.user.mobile,
      active: s.active,
      createdAt: s.createdAt,
    }))
  );
});

// POST: doctor creates a new staff/receptionist account, scoped to their own
// appointment queue only. The doctor sets the initial password directly and
// shares it with the staff member — there's no SMS/email delivery in this
// codebase to build an invite-link flow on top of.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveDoctor(authUser, { requireSubscription: true });
  if (denied) return denied;

  if (!createLimiter(authUser.id)) {
    return NextResponse.json({ error: "Too many staff accounts tried in a short time — please wait a while and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = validateRegistration(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, mobile, password } = parsed.data;

  const unavailable = () => NextResponse.json({ error: MOBILE_UNAVAILABLE, code: "MOBILE_UNAVAILABLE" }, { status: 409 });
  if (await prisma.user.findUnique({ where: { mobile }, select: { id: true } })) return unavailable();

  let created;
  try {
    created = await prisma.user.create({
      data: {
        name,
        mobile,
        password: await hashPassword(password),
        role: "STAFF",
        staffAccount: { create: { doctorId: authUser.id } },
      },
      select: { id: true, name: true, mobile: true, staffAccount: { select: { id: true, active: true, createdAt: true } } },
    });
  } catch (err) {
    // Registered by someone else between the check and the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return unavailable();
    throw err;
  }

  return NextResponse.json({
    staffProfileId: created.staffAccount!.id,
    userId: created.id,
    name: created.name,
    mobile: created.mobile,
    active: created.staffAccount!.active,
    createdAt: created.staffAccount!.createdAt,
  });
});
