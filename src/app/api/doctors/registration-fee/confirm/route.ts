import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// POST: Confirm the doctor's one-time registration fee (simulated/sandbox gateway,
// same isolated swap point pattern as /api/payments/confirm).
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { method } = await req.json().catch(() => ({ method: undefined }));

  try {
    const updated = await prisma.doctorProfile.update({
      where: { userId: authUser.id },
      data: { registrationFeePaid: true, registrationFeeStatus: "PAID" },
    });
    return NextResponse.json({ ...updated, gatewayMethod: method ?? "UPI", simulated: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
}
