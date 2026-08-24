import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: the current doctor's own support tickets — raised via the Support
// Assistant chat's create_support_ticket tool, listed here for a plain
// read-only view outside the chat.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const complaints = await prisma.complaint.findMany({
    where: { userId: authUser.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, subject: true, description: true, status: true, createdAt: true },
  });

  return NextResponse.json(complaints);
}
