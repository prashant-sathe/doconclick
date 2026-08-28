import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";

function getMessagingClient() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase is not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY missing)"
    );
  }
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getMessaging();
}

// Best-effort push — never throws into the caller. A push failure should
// never block or fail the write it's reporting on.
// FCM caps sendEachForMulticast at 500 tokens per call.
const FCM_BATCH_SIZE = 500;

export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; url: string }
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
    if (tokens.length === 0) return;

    const messaging = getMessagingClient();
    let totalSuccess = 0;
    const staleTokenIds: string[] = [];

    for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
      const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
      const response = await messaging.sendEachForMulticast({
        tokens: batch.map((t) => t.token),
        notification: { title: payload.title, body: payload.body },
        // `webpush.fcmOptions.link` is a web-push-only convenience the
        // browser's push service reads directly; native listeners
        // (pushNotificationActionPerformed) read `data` instead, so both are
        // needed for tap-to-navigate to work on every platform.
        data: { url: payload.url },
        webpush: { fcmOptions: { link: payload.url } },
      });
      totalSuccess += response.successCount;

      response.responses.forEach((r, idx) => {
        if (r.error?.code === "messaging/registration-token-not-registered") {
          staleTokenIds.push(batch[idx].id);
        }
      });
    }

    console.log(`sendPushToUsers(${userIds.join(",")}): ${totalSuccess}/${tokens.length} delivered`);

    if (staleTokenIds.length > 0) {
      await prisma.pushToken.deleteMany({ where: { id: { in: staleTokenIds } } });
    }
  } catch (err) {
    console.error("sendPushToUsers failed:", err);
  }
}

export function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string }
): Promise<void> {
  return sendPushToUsers([userId], payload);
}

export async function sendPushToAdmins(payload: { title: string; body: string; url: string }): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  return sendPushToUsers(admins.map((a) => a.id), payload);
}
