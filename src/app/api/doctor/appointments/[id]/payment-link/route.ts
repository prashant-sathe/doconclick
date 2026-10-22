import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { signGuestPaymentToken, guestPaymentPath } from "@/lib/guestPaymentToken";
import { externalOrigin } from "@/lib/googleOAuth";
import { netPayable } from "@/lib/coupons";

// POST: a pay link (shown as a QR at the desk, or sent on WhatsApp) for an
// accepted, unpaid online appointment of this doctor's — so a patient who
// can't or won't pay in the app pays on their own phone with no sign-in
// (/pay/[id]). Each call issues a fresh link; older ones keep working until
// they expire, and all of them pay the same appointment once.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await resolveDoctorScope(authUser);
  if (scope.denied) return scope.denied;
  const { id } = await params;

  const appt = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, doctorId: true, status: true, paymentMethod: true, paymentStatus: true, amount: true, discountAmount: true, patient: { select: { mobile: true } } },
  });
  if (!appt || appt.doctorId !== scope.doctorId) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appt.paymentStatus === "PAID") return NextResponse.json({ error: "This appointment is already paid." }, { status: 400 });
  if (appt.paymentMethod !== "ONLINE") {
    return NextResponse.json({ error: "This visit is set to be paid in cash." }, { status: 400 });
  }
  if (appt.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Only an accepted, upcoming appointment can be paid for." }, { status: 400 });
  }

  const { token, expiresAt } = signGuestPaymentToken(appt.id);
  return NextResponse.json({
    url: `${externalOrigin(req, new URL(req.url))}${guestPaymentPath(appt.id, token)}`,
    expiresAt: expiresAt.toISOString(),
    amount: netPayable(appt),
    // For the desk's "Send on WhatsApp" button.
    patientMobile: appt.patient.mobile,
  });
}
