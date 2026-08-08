import { NextResponse } from "next/server";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// GET: Address search suggestions, proxied to OpenStreetMap Nominatim
// (server-side, per Nominatim's usage policy which requires a real User-Agent
// and discourages direct client-side browser calls)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

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
    const res = await fetch(url, {
      headers: { "User-Agent": "DocOnClick/1.0 (healthcare booking app)" },
    });
    if (!res.ok) return NextResponse.json([]);

    const data: NominatimResult[] = await res.json();
    const results = data.map((r) => ({
      id: r.place_id,
      label: r.display_name,
      lat: Number(r.lat),
      lon: Number(r.lon),
    }));
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
