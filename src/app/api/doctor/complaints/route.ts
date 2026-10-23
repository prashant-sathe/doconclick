import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: the current doctor's own support tickets — raised via the Support
// Assistant chat's create_support_ticket tool, listed here for a plain
// read-only view outside the chat.
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const complaints = await prisma.complaint.findMany({
    where: { userId: authUser.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, subject: true, description: true, status: true, createdAt: true },
  });

  return NextResponse.json(complaints);
});
