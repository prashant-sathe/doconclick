import { RtcTokenBuilder, RtcRole } from "agora-token";

export const TOKEN_TTL_SECONDS = 3600;

// Each participant joins with their own string uid (their user id, Agora
// "user account" mode), so the token is bound to that one person and the
// call can tell doctor and patient apart. Clients renew it before expiry
// (token-privilege-will-expire → GET video-token again).
export function generateAgoraToken(channel: string, account: string): { appId: string; token: string } {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    throw new Error("Agora is not configured (AGORA_APP_ID / AGORA_APP_CERTIFICATE missing)");
  }

  const token = RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCertificate,
    channel,
    account,
    RtcRole.PUBLISHER,
    TOKEN_TTL_SECONDS,
    TOKEN_TTL_SECONDS
  );

  return { appId, token };
}
