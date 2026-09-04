import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { termsAcceptedAt: new Date() },
    select: { termsAcceptedAt: true },
  });

  return NextResponse.json({ termsAcceptedAt: updated.termsAcceptedAt });
}
