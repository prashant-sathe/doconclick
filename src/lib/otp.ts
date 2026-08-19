import { randomInt } from "crypto";

// A cryptographically random 6-digit code, zero-padded (e.g. "042817").
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Never send the patient's visit-verification code to the doctor — every
// doctor-facing appointment response must go through this before being serialized.
export function omitOtp<T extends { otpCode?: string | null }>(appointment: T): Omit<T, "otpCode"> {
  const { otpCode: _otpCode, ...rest } = appointment;
  return rest;
}
