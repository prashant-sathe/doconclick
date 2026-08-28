import { NextResponse } from "next/server";

// Apple Universal Links association file. Must be served from
// https://doconclick.co.in/.well-known/apple-app-site-association as JSON with
// no redirects. Served via a route handler (not a static public/ file) so the
// Content-Type is guaranteed to be application/json.
//
// TODO: replace <TEAM_ID> with the Apple Developer Team ID (Membership page,
// or Xcode > Signing & Capabilities once a team is selected). The App ID must
// have the "Associated Domains" capability enabled.
const TEAM_ID = process.env.APPLE_TEAM_ID ?? "TEAM_ID";
const APP_ID = `${TEAM_ID}.com.doconclick.app`;

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: APP_ID,
            // Every in-app path. Excludes API and auth-callback style routes.
            paths: ["NOT /api/*", "*"],
          },
        ],
      },
    },
    { headers: { "content-type": "application/json" } },
  );
}
