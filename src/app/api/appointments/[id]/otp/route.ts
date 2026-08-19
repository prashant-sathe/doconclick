import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";
import { omitOtp } from "@/lib/otp";

// PATCH: Doctor verifies the patient's visit OTP before they can add a prescription
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.otpVerifiedAt) {
    return NextResponse.json(omitOtp(appointment));
  }

  const { otp } = await req.json();
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    return NextResponse.json({ error: "Enter the 6-digit code the patient shares with you." }, { status: 400 });
  }
  if (otp.trim() !== appointment.otpCode) {
    return NextResponse.json(
      { error: "Incorrect OTP. Please check with the patient and try again." },
      { status: 400 }
    );
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { otpVerifiedAt: new Date() },
  });
  return NextResponse.json(omitOtp(updated));
}
