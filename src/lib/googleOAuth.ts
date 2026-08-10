import { randomUUID } from "crypto";

export const STATE_COOKIE_NAME = "google_oauth_state";
export const STATE_COOKIE_MAX_AGE = 5 * 60; // 5 minutes — just long enough for the OAuth round trip

export type OAuthRole = "PATIENT" | "DOCTOR";
export type OAuthIntent = "login" | "reset";

export type OAuthState = {
  nonce: string;
  role: OAuthRole;
  next?: string;
  intent: OAuthIntent;
};

export function newNonce(): string {
  return randomUUID();
}

// Behind nginx, the app only ever sees plain HTTP (TLS is terminated at the
// proxy), so `new URL(req.url).origin` resolves to `http://` even in
// production. Google rejects a non-HTTPS, non-localhost redirect_uri outright
// ("doesn't comply with Google's OAuth 2.0 policy"), so the externally-visible
// origin must be reconstructed from the forwarded headers nginx sets
// (`proxy_set_header X-Forwarded-Proto/Host` in deploy/nginx/nginx.conf).
export function externalOrigin(req: Request, url: URL): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export function encodeState(state: Omit<OAuthState, "intent"> & { intent?: OAuthIntent }): string {
  return Buffer.from(JSON.stringify({ intent: "login", ...state })).toString("base64url");
}

export function decodeState(raw: string): OAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      parsed &&
      typeof parsed.nonce === "string" &&
      (parsed.role === "PATIENT" || parsed.role === "DOCTOR")
    ) {
      return { intent: "login", ...parsed } as OAuthState;
    }
    return null;
  } catch {
    return null;
  }
}
