import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

// Streams an S3-hosted attachment back through our own origin with a
// Content-Disposition header, so the browser downloads it instead of
// navigating to it (the S3 bucket isn't CORS-configured for blob fetches,
// and its objects were uploaded without a Content-Disposition of their own).
// Restricted to our own bucket host to avoid being an open URL-fetch proxy.
export async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileUrl = searchParams.get("url");
  const name = searchParams.get("name") || "download";
  // "inline" is used to embed the file in the page itself (e.g. a doctor's
  // signature image drawn into a prescription) rather than triggering a save.
  const disposition = searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  if (!fileUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    return NextResponse.json({ error: "AWS S3 is not configured" }, { status: 500 });
  }
  const allowedHost = `${bucket}.s3.${region}.amazonaws.com`;

  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (parsed.hostname !== allowedHost) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  const upstream = await fetch(parsed.toString());
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const safeName = name.replace(/[\r\n"]/g, "");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
    },
  });
}
