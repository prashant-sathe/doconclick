import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveProvider } from "@/lib/providerGuard";

// GET: the current doctor's own past settlements, newest first
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role !== "DOCTOR" && authUser.role !== "NURSE") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const denied = await requireActiveProvider(authUser, { requireSubscription: true });
  if (denied) return denied;

  const settlements = await prisma.settlement.findMany({
    where: { doctorId: authUser.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(settlements);
}
