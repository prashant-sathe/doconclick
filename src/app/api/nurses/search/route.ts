import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { searchNurses } from "@/lib/nurseSearch";

// GET ?serviceId=…&lat=…&lng=… — see searchNurses (src/lib/nurseSearch.ts).
export async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  if (!serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : null;
  const lng = searchParams.get("lng") ? Number(searchParams.get("lng")) : null;

  const result = await searchNurses({ patientId: authUser.id, serviceId, lat, lng });
  if (!result.service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json(result.needsLocation ? { service: result.service, nurses: [], needsLocation: true } : { service: result.service, nurses: result.nurses });
}
