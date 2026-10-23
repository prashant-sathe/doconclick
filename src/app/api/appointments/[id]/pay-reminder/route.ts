import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { resolveProviderScope } from "@/lib/providerGuard";
import { isUnpaidOnline, sendPayReminder, PAY_REMINDER_COOLDOWN_MS } from "@/lib/payReminder";
import { withErrorLocale } from "@/lib/apiErrors";

// POST: "Remind to pay" — the provider (or the doctor's front desk) nudges a
// patient who hasn't paid for an accepted visit. At most once per
// PAY_REMINDER_COOLDOWN_MS per visit.
export const POST = withErrorLocale(async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await resolveProviderScope(authUser);
  if (scope.denied) return scope.denied;
  const { id } = await params;

  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt || appt.doctorId !== scope.doctorId) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (appt.status !== "SCHEDULED") return NextResponse.json({ error: "Only an accepted, upcoming visit can be paid for." }, { status: 400 });
  if (!isUnpaidOnline(appt)) return NextResponse.json({ error: "There's nothing to pay online for this visit." }, { status: 400 });

  const providerName = authUser.role === "STAFF"
    ? (await prisma.user.findUnique({ where: { id: scope.doctorId }, select: { name: true } }))?.name ?? "Your doctor"
    : authUser.name;
  const r = await sendPayReminder(appt, providerName, "manual");
  if (!r.sent) {
    const wait = r.at ? Math.max(1, Math.ceil((r.at.getTime() + PAY_REMINDER_COOLDOWN_MS - Date.now()) / 60_000)) : 1;
    return NextResponse.json({ error: `The patient was just reminded. You can remind them again in ${wait} min.`, code: "REMINDED_RECENTLY", reminderSentAt: r.at }, { status: 429 });
  }
  return NextResponse.json({ reminderSentAt: r.at, amount: r.amount });
});
