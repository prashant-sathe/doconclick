// Who can read / send in an appointment's chat, by booking status:
//
// - PENDING_APPROVAL: not open yet (opens when the provider accepts).
// - SCHEDULED: open.
// - COMPLETED: history stays readable; sending is allowed for the admin-set
//   follow-up window (PlatformSettings.chatFollowUpDays) after completion,
//   then read-only.
// - CANCELLED / REJECTED / EXPIRED / NO_SHOW: read-only.

import { prisma } from "@/lib/prisma";
import { CHAT_FOLLOW_UP_DEFAULT_DAYS } from "@/lib/bookingHorizon";

export type ChatState = {
  canRead: boolean;
  canSend: boolean;
  /** Why sending (or reading) isn't possible — shown in the chat UI. */
  reason: string | null;
  /** While a completed visit's follow-up window is open: when it closes. */
  sendUntil: Date | null;
};

export async function getChatFollowUpDays(): Promise<number> {
  const settings = await prisma.platformSettings.findFirst({ select: { chatFollowUpDays: true } });
  return settings?.chatFollowUpDays ?? CHAT_FOLLOW_UP_DEFAULT_DAYS;
}

const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export function chatState(
  appt: { status: string; providerType: string; completedAt: Date | null; scheduledAt: Date },
  followUpDays: number,
  now: Date = new Date(),
): ChatState {
  const provider = appt.providerType === "NURSE" ? "nurse" : "doctor";
  const readOnly = (reason: string): ChatState => ({ canRead: true, canSend: false, reason, sendUntil: null });

  switch (appt.status) {
    case "PENDING_APPROVAL":
      return { canRead: false, canSend: false, reason: `Chat opens once the ${provider} accepts this appointment.`, sendUntil: null };
    case "SCHEDULED":
      return { canRead: true, canSend: true, reason: null, sendUntil: null };
    case "COMPLETED": {
      // Rows completed before completedAt existed fall back to the visit time.
      const until = new Date((appt.completedAt ?? appt.scheduledAt).getTime() + followUpDays * 24 * 60 * 60_000);
      if (followUpDays > 0 && now < until) return { canRead: true, canSend: true, reason: null, sendUntil: until };
      return readOnly(
        followUpDays > 0
          ? `The follow-up chat for this visit closed on ${fmt(until)}. You can still read it — book again to talk to the ${provider}.`
          : `This visit is complete, so the chat is read-only. Book again to talk to the ${provider}.`,
      );
    }
    case "CANCELLED":
      return readOnly("This appointment was cancelled, so the chat is read-only.");
    case "REJECTED":
      return readOnly(`The ${provider} declined this request, so there's no chat.`);
    case "EXPIRED":
      return readOnly("This request expired before it was accepted, so there's no chat.");
    case "NO_SHOW":
      return readOnly("This visit was marked as a no-show, so the chat is read-only.");
    default:
      return readOnly("This chat is read-only.");
  }
}
