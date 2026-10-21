import { NextResponse } from "next/server";
import { geocodeGuard, searchLimiter, cachedLookup, GeocodeBusyError } from "@/lib/geocode";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// GET: Address search suggestions, proxied to OpenStreetMap Nominatim
// (server-side, per Nominatim's usage policy which requires a real User-Agent
// and discourages direct client-side browser calls). Signed-in users only,
// rate-limited and cached (src/lib/geocode.ts).
export async function GET(req: Request) {
  const blocked = await geocodeGuard(searchLimiter);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  // Same text in any case/spacing is the same search — and the same cache entry.
  const q = searchParams.get("q")?.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);

  if (!q || q.length < 3) {
    return NextResponse.json([]);
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "in");

  try {
    const results = await cachedLookup(`search:${q}`, url, (raw) =>
      (raw as NominatimResult[]).map((r) => ({
        id: r.place_id,
        label: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
      }))
    );
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof GeocodeBusyError) {
      return NextResponse.json({ error: "Address search is busy — try again in a moment." }, { status: 503 });
    }
    return NextResponse.json([]);
  }
}
