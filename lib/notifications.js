import { prisma } from "@/lib/prisma";

// Persist one in-app notification for the rival, keyed by activity to keep
// webhook retries idempotent. Push delivery can be layered on subscriptions.
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
    return await prisma.notification.create({
      data: {
        user_id: recipientId,
        activity_id: activityId,
        title: "Your bro is cooking.",
        body,
        href: "/rival",
      },
    });
  } catch (error) {
    if (error?.code === "P2002") return null;
    throw error;
  }
}
