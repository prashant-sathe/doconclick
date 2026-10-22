import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, safeNum } from "@/lib/adminAuth";

// The list shows only what the bookings table needs; everything else (notes,
// prescription, addresses, gateway ids…) is in the detail drawer
// (/api/admin/bookings/[id]). The visit code is the patient's and is never sent.
const SYMPTOMS_PREVIEW = 120;

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const appointments = await prisma.appointment.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      providerType: true,
      consultType: true,
      status: true,
      patientName: true,
      relation: true,
      symptoms: true,
      amount: true,
      platformFee: true,
      paymentStatus: true,
      paymentMethod: true,
      scheduledAt: true,
      createdAt: true,
      patient: { select: { name: true, mobile: true } }, // mobile: a quick-signup patient may have no name yet
      doctor: { select: { name: true } },
    },
  });
  return NextResponse.json(
    appointments.map((a) => ({
      ...a,
      symptoms: a.symptoms.length > SYMPTOMS_PREVIEW ? `${a.symptoms.slice(0, SYMPTOMS_PREVIEW - 1)}…` : a.symptoms,
      amount: safeNum(a.amount),
      platformFee: safeNum(a.platformFee),
    }))
  );
}
