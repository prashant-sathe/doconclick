import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: the current patient's own support tickets
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const complaints = await prisma.complaint.findMany({
    where: { userId: authUser.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, subject: true, description: true, status: true, createdAt: true },
  });

  return NextResponse.json(complaints);
}

// POST: raise a new support ticket
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { subject, description } = await req.json();
  const trimmedSubject = String(subject ?? "").trim();
  const trimmedDescription = String(description ?? "").trim();
  if (!trimmedSubject || !trimmedDescription) {
    return NextResponse.json({ error: "Subject and description are required" }, { status: 400 });
  }

  const complaint = await prisma.complaint.create({
    data: {
      userId: authUser.id,
      subject: trimmedSubject.slice(0, 200),
      description: trimmedDescription.slice(0, 4000),
    },
  });

  return NextResponse.json(complaint, { status: 201 });
}
