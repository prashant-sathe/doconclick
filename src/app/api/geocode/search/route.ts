import { NextResponse } from "next/server";
import { geocodeGuard, searchLimiter, searchAddress, normaliseQuery, GeocodeBusyError } from "@/lib/geocode";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: Address search suggestions, proxied to OpenStreetMap Nominatim
// (server-side, per Nominatim's usage policy which requires a real User-Agent
// and discourages direct client-side browser calls). Signed-in users only,
// rate-limited and cached (src/lib/geocode.ts).
export const GET = withErrorLocale(async function GET(req: Request) {
  const blocked = await geocodeGuard(searchLimiter);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const q = normaliseQuery(searchParams.get("q") ?? "");

  if (q.length < 3) {
    return NextResponse.json([]);
  }

  try {
    const results = await searchAddress(q);
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof GeocodeBusyError) {
      return NextResponse.json({ error: "Address search is busy — try again in a moment." }, { status: 503 });
    }
    return NextResponse.json([]);
  }
});
