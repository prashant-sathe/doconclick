import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

// Fire-and-forget push to every device the user is registered on. Never
// throws — a notification failure must never break the API route it's
// called from (booking, chat, status updates, etc.).
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const app = getFirebaseApp();
    if (!app) return; // FCM not configured in this environment — no-op

    const tokens = await prisma.deviceToken.findMany({ where: { userId } });
    if (tokens.length === 0) return;

    const messaging = getMessaging(app);
    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });

    const staleTokens = response.responses
      .map((r, i) => (!r.success && r.error?.code === "messaging/registration-token-not-registered" ? tokens[i].token : null))
      .filter((t): t is string => t !== null);

    if (staleTokens.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: staleTokens } } });
    }
  } catch (err) {
    console.error("Push notification error:", err);
  }
}
