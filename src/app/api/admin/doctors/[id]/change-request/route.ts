import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { LOCKED_FIELDS, type FieldChanges } from "@/lib/doctorProfileLock";

const MAX_NOTE = 500;

// POST { action: "APPROVE" | "REJECT", note? } — review a verified doctor's
// pending request to change their registration number / qualification /
// specialty (see PATCH /api/doctors/me). Approving applies the new values;
// rejecting needs a note, which is pushed to the doctor. The live profile is
// untouched until then.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const { action, note: rawNote } = await req.json().catch(() => ({}));
  if (action !== "APPROVE" && action !== "REJECT") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (action === "REJECT" && !note) {
    return NextResponse.json({ error: "Give a reason — it's sent to the doctor." }, { status: 400 });
  }
  if (note.length > MAX_NOTE) {
    return NextResponse.json({ error: `Keep the note under ${MAX_NOTE} characters.` }, { status: 400 });
  }

  const request = await prisma.doctorChangeRequest.findFirst({
    where: { doctorId: id, status: "PENDING", doctor: { role: "DOCTOR", deletedAt: null } },
  });
  if (!request) return NextResponse.json({ error: "No pending change request for this doctor." }, { status: 404 });
  const changes = request.changes as FieldChanges;

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Conditional, so two admins reviewing at once can't both act on it.
      const { count } = await tx.doctorChangeRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: action === "APPROVE" ? "APPROVED" : "REJECTED", reviewNote: note || null, resolvedAt: new Date(), resolvedById: authUser.id },
      });
      if (count === 0) return null;
      if (action === "APPROVE") {
        const data: Record<string, string | null> = {};
        for (const field of LOCKED_FIELDS) if (changes[field]) data[field] = changes[field]!.to;
        await tx.doctorProfile.update({ where: { userId: id }, data });
      }
      return tx.doctorChangeRequest.findUniqueOrThrow({ where: { id: request.id } });
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "That registration number is now used by another doctor." }, { status: 409 });
    }
    throw err;
  }
  if (!updated) {
    return NextResponse.json({ error: "This request was just reviewed by someone else. Please refresh." }, { status: 409 });
  }

  // The changed fields, as a translated list: "registration number, specialty".
  // The first comes from fragments.lockedField, the rest from
  // fragments.lockedFieldNext (which carries the ", " separator).
  const changed = LOCKED_FIELDS.filter((f) => changes[f]);
  const parts = Object.fromEntries(
    LOCKED_FIELDS.map((_, i) => [`field${i + 1}`, changed[i] ? { key: `fragments.${i === 0 ? "lockedField" : "lockedFieldNext"}.${changed[i]}` } : null]),
  );
  void sendPushToUser(id, action === "APPROVE"
    ? { key: "profileChangeApproved", values: { count: changed.length }, parts, url: "/doctor/profile/professional" }
    : { key: "profileChangeRejected", values: { count: changed.length, note }, parts, url: "/doctor/profile/professional" });

  return NextResponse.json(updated);
}
