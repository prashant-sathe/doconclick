import { NextResponse } from "next/server";
import { requireRole } from "@/lib/routeGuards";
import { withErrorLocale } from "@/lib/apiErrors";
import { COMPLAINT_FILER_ROLES } from "@/lib/complaints";
import { linkableAppointments } from "@/lib/complaintAccess";

// GET: the caller's recent bookings, for the "which booking is this about?"
// picker on the new-ticket form.
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole(...COMPLAINT_FILER_ROLES);
  if (denied) return denied;
  return NextResponse.json(await linkableAppointments(authUser));
});
