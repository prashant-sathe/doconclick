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
