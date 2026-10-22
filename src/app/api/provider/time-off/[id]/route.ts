import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { isProviderRole } from "@/lib/providerGuard";
import { istDayKey } from "@/lib/istDate";

// DELETE: back early / plans changed — remove current or upcoming time off.
// Bookings it cancelled stay cancelled (patients were refunded); the days
// simply open for booking again.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || !isProviderRole(authUser.role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.providerTimeOff.findUnique({ where: { id } });
  if (!row || row.providerId !== authUser.id) return NextResponse.json({ error: "Time off not found" }, { status: 404 });
  if (row.endDate < istDayKey(new Date())) return NextResponse.json({ error: "That time off is already over." }, { status: 400 });
  await prisma.providerTimeOff.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
