import { NextResponse } from "next/server";
import { geocodeGuard, reverseLimiter, cachedLookup, GeocodeBusyError } from "@/lib/geocode";
import { withErrorLocale } from "@/lib/apiErrors";

interface NominatimReverseResult {
  display_name?: string;
  address?: { postcode?: string };
}

// GET: Resolve GPS coordinates to a human-readable address, proxied to
// OpenStreetMap Nominatim (server-side, per Nominatim's usage policy which
// requires a real User-Agent and discourages direct client-side browser calls).
// Signed-in users only, rate-limited and cached (src/lib/geocode.ts).
export const GET = withErrorLocale(async function GET(req: Request) {
  const blocked = await geocodeGuard(reverseLimiter);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");
  if (!latRaw || !lonRaw) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  const latNum = Number(latRaw);
  const lonNum = Number(lonRaw);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) {
    return NextResponse.json({ error: "lat must be -90…90 and lon -180…180" }, { status: 400 });
  }
  // ~11 m: finer than an address resolves to, and nearby GPS fixes share a cache entry.
  const lat = latNum.toFixed(4);
  const lon = lonNum.toFixed(4);

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  try {
    const result = await cachedLookup(`reverse:${lat},${lon}`, url, (raw) => {
      const data = raw as NominatimReverseResult;
      return { label: data.display_name ?? null, pinCode: data.address?.postcode ?? null };
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeocodeBusyError) {
      return NextResponse.json({ error: "Location lookup is busy — try again in a moment.", label: null, pinCode: null }, { status: 503 });
    }
    return NextResponse.json({ label: null, pinCode: null });
  }
});
