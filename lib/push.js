import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (pushConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn("[push] VAPID env missing (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT); push delivery disabled.");
}

// Send a Web Push payload to every subscription of a user. Expired
// subscriptions (404/410) are pruned. Never throws.
export async function sendPushToUser(userId, payload) {
  if (!pushConfigured) return { sent: 0, failed: 0, skipped: true };
  if (!userId || !payload) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  let subscriptions;
  try {
    subscriptions = await prisma.pushSubscription.findMany({ where: { user_id: userId } });
  } catch (error) {
    console.warn(`[push] failed to load subscriptions for user ${userId}:`, error?.message);
    return { sent: 0, failed: 0 };
  }

  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, body);
        sent++;
      } catch (error) {
        failed++;
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          try {
            await prisma.pushSubscription.delete({ where: { id: row.id } });
          } catch (deleteError) {
            console.warn(`[push] failed to prune subscription ${row.id}:`, deleteError?.message);
          }
        } else {
          console.warn(`[push] send failed for user ${userId} (status ${statusCode ?? "unknown"}):`, error?.message);
        }
      }
    }),
  );

  return { sent, failed };
}

export async function sendPushToUsers(userIds, payload) {
  const uniqueIds = [...new Set((userIds ?? []).filter(Boolean))];
  const results = await Promise.all(uniqueIds.map((id) => sendPushToUser(id, payload)));
  return results.reduce(
    (acc, r) => ({
      sent: acc.sent + (r.sent ?? 0),
      failed: acc.failed + (r.failed ?? 0),
      skipped: acc.skipped || Boolean(r.skipped),
    }),
    { sent: 0, failed: 0, skipped: false },
  );
}
