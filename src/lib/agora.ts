import { RtcTokenBuilder, RtcRole } from "agora-token";

const TOKEN_TTL_SECONDS = 3600;

// uid 0 lets each client join with a client-assigned uid, so a single
// server-issued token works for both the doctor and patient sides of a call.
export function generateAgoraToken(channel: string): { appId: string; token: string } {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    throw new Error("Agora is not configured (AGORA_APP_ID / AGORA_APP_CERTIFICATE missing)");
  }

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    0,
    RtcRole.PUBLISHER,
    TOKEN_TTL_SECONDS,
    TOKEN_TTL_SECONDS
  );

  return { appId, token };
}
