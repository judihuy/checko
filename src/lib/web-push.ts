// Web Push — Server-seitige Push Notification Logik
// Sendet Push Notifications via web-push Library

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// VAPID-Keys konfigurieren (nur wenn vorhanden)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || "mailto:info@checko.ch";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  actions?: Array<{ action: string; title: string }>;
}

/**
 * Push Notification an alle Subscriptions eines Users senden
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[Push] VAPID Keys nicht konfiguriert — Push deaktiviert");
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/dashboard",
    icon: payload.icon || "/gecko-logo.png",
    tag: payload.tag || "checko-notification",
    actions: payload.actions || [],
  });

  for (const sub of subscriptions) {
    try {
      const keys = JSON.parse(sub.keys);
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        },
        pushPayload
      );
      sent++;
    } catch (error: unknown) {
      failed++;
      // 410 Gone oder 404 → Subscription ist ungültig, aus DB entfernen
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        console.log(`[Push] Subscription abgelaufen, entferne: ${sub.id}`);
        await prisma.pushSubscription.delete({
          where: { id: sub.id },
        }).catch(() => {});
      } else {
        console.error(`[Push] Fehler beim Senden an ${sub.id}:`, error);
      }
    }
  }

  return { sent, failed };
}
