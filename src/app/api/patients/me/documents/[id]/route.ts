import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// DELETE: remove one document from the patient's own vault. Doesn't remove
// the file from S3, just the record — same convention as doctor documents
// (see src/app/api/doctors/me/documents/route.ts).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await prisma.patientDocument.findUnique({ where: { id } });
  if (!doc || doc.patientId !== authUser.id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await prisma.patientDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
