import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

// Persist one in-app notification for the rival, keyed by activity to keep
// webhook retries idempotent. A web push is fired to the recipient afterwards.
export async function createRivalActivityNotification({ recipientId, activityId, actor, type, repositoryName }) {
  if (!recipientId || !activityId) return null;
  const action = {
    PUSH: "pushed commits",
    PR: "opened a pull request",
    MERGE: "merged a pull request",
    ISSUE: "updated an issue",
    STAR: "starred a repository",
    FORK: "forked a repository",
    CREATE_REPO: "created a repository",
  }[type] ?? "was active";
  const body = `${actor} ${action}${repositoryName ? ` in ${repositoryName}` : ""}.`;
  try {
    const notification = await prisma.notification.create({
      data: {
        user_id: recipientId,
        activity_id: activityId,
        title: "Your bro is cooking.",
        body,
        href: "/rival",
      },
    });
    sendPushToUser(recipientId, {
      title: notification.title,
      body: notification.body,
      href: notification.href,
      tag: "rival-activity",
    }).catch((error) => {
      console.warn("[push] rival-activity push failed:", error?.message);
    });
    return notification;
  } catch (error) {
    if (error?.code === "P2002") return null;
    throw error;
  }
}
