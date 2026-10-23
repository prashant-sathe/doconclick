import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createTranslator } from "use-intl/core";
import { prisma } from "@/lib/prisma";
import { loadMessages, type Messages } from "@/i18n/messages";
import { DEFAULT_APP_LANGUAGE, isAppLanguage, formattingLocale, type AppLanguage } from "@/lib/appLanguage";

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

// A push is either fixed text, or a message key in messages/<locale>/push.json
// (`key.title` + `key.body`, ICU, with `values`) — built in each recipient's
// own User.language. Values may themselves be push keys' sub-messages: pass
// `parts: { name: "push.some.part" }` to translate a fragment per language and
// interpolate it as {name}.
type PushKey = keyof Messages["push"];
type PushValues = Record<string, string | number | Date>;
export type PushPayload =
  | { title: string; body: string; url: string }
  | { key: PushKey; values?: PushValues; parts?: Record<string, { key: string; values?: PushValues } | null>; url: string };

async function textFor(payload: Extract<PushPayload, { key: PushKey }>, locale: AppLanguage) {
  const messages = await loadMessages(locale);
  // Messages are looked up by `messages`; `locale` here only drives formatting.
  const t = createTranslator({ locale: formattingLocale(locale) as AppLanguage, messages, namespace: "push", timeZone: "Asia/Kolkata" });
  const tr = t as unknown as (k: string, v?: PushValues) => string;
  const parts: PushValues = {};
  for (const [name, part] of Object.entries(payload.parts ?? {})) parts[name] = part ? tr(part.key, part.values) : "";
  const values = { ...(payload.values ?? {}), ...parts };
  return { title: tr(`${payload.key}.title`, values), body: tr(`${payload.key}.body`, values).replace(/\s+/g, " ").trim() };
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  if ("key" in payload) {
    try {
      const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, language: true } });
      const byLang = new Map<AppLanguage, string[]>();
      for (const u of users) {
        const lang = isAppLanguage(u.language) ? u.language : DEFAULT_APP_LANGUAGE;
        byLang.set(lang, [...(byLang.get(lang) ?? []), u.id]);
      }
      for (const [lang, ids] of byLang) await deliver(ids, { ...(await textFor(payload, lang)), url: payload.url });
    } catch (err) {
      console.error("sendPushToUsers (localized) failed:", err);
    }
    return;
  }
  return deliver(userIds, payload);
}

async function deliver(userIds: string[], payload: { title: string; body: string; url: string }): Promise<void> {
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

export function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  return sendPushToUsers([userId], payload);
}

export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  return sendPushToUsers(admins.map((a) => a.id), payload);
}
