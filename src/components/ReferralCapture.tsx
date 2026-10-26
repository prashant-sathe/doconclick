"use client";
import { useEffect } from "react";

// On the register pages: an invite link (…/register?ref=CODE — on the web,
// or a native deep link routed here by NativeBootstrap) hands its code to
// the server, which keeps it in an httpOnly cookie for whichever sign-up
// follows, form or Google (src/lib/referrals.ts). Renders nothing.
export default function ReferralCapture() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (!code) return;
    fetch("/api/referrals/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => {});
  }, []);
  return null;
}
