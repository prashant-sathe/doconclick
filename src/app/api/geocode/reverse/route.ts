import { NextResponse } from "next/server";

interface NominatimReverseResult {
  display_name: string;
  address?: { postcode?: string };
}

// GET: Resolve GPS coordinates to a human-readable address, proxied to
// OpenStreetMap Nominatim (server-side, per Nominatim's usage policy which
// requires a real User-Agent and discourages direct client-side browser calls)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DocOnClick/1.0 (healthcare booking app)" },
    });
    if (!res.ok) return NextResponse.json({ label: null, pinCode: null });

    const data: NominatimReverseResult = await res.json();
    return NextResponse.json({ label: data.display_name ?? null, pinCode: data.address?.postcode ?? null });
  } catch {
    return NextResponse.json({ label: null });
  }
}
