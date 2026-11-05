import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendRepositoryCommits } from "@/lib/commits";
import { upsertRepository, findRepositoryId } from "@/lib/repos";
import { getActivityPoints, updateRivalryScore } from "@/lib/rivalry";
import { createRivalActivityNotification } from "@/lib/notifications";
import { getRepoCommitBySha, toCommitRecord } from "@/lib/github";
import { getGitHubAccessToken } from "@/lib/github-token";

export const runtime = "nodejs";

function validSignature(raw, signature) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function logDelivery({ delivery, event, payload, decision, reason, userId }) {
  const summary = {
    delivery,
    event,
    action: payload?.action ?? null,
    actor: payload?.sender?.login ?? null,
    repo: payload?.repository?.full_name ?? null,
    decision,
    ...(reason ? { reason } : {}),
    ...(userId ? { userId } : {}),
  };
  console.log(`[github/webhook] ${JSON.stringify(summary)}`);
}

// Map a webhook to the Pushr user that should own the activity:
// the sender first, then the repository owner. Returns the full user row or
// null when neither login has a Pushr account.
async function resolveActorUser(payload, actorLogin) {
  const candidates = [actorLogin, payload?.repository?.owner?.login]
    .filter((login) => typeof login === "string" && login.length > 0);
  for (const login of [...new Set(candidates)]) {
    const user = await prisma.user.findUnique({ where: { github_username: login } });
    if (user) return user;
  }
  return null;
}

function toActivity(event, payload, delivery) {
  const action = payload.action ?? "";
  let type;
  if (event === "push") type = "PUSH";
  else if (event === "pull_request") type = payload.pull_request?.merged && action === "closed" ? "MERGE" : "PR";
  else if (event === "pull_request_review") type = "PR";
  else if (event === "issues") type = "ISSUE";
  else if (event === "star") type = "STAR";
  else if (event === "fork") type = "FORK";
  else if (event === "create" && payload.ref_type === "repository") type = "CREATE_REPO";
  else return null;
  const actor = payload.sender?.login;
  if (!actor) return null;
  const commits = event === "push" ? (payload.commits ?? []).map((c) => ({ sha: c.id, message: c.message, url: c.url, author: c.author?.name ?? null, committed_at: c.timestamp })) : [];
  const eventDate = event === "push"
    ? payload.head_commit?.timestamp ?? commits.at(-1)?.committed_at
    : event === "pull_request" ? payload.pull_request?.updated_at
      : event === "pull_request_review" ? payload.review?.submitted_at
        : event === "issues" ? payload.issue?.updated_at
          : event === "star" ? payload.starred_at
            : event === "fork" ? payload.forkee?.created_at
              : payload.repository?.created_at;
  return {
    actor, type,
    id: `${delivery}:${event}:${action || "event"}`,
    createdAt: eventDate && !Number.isNaN(new Date(eventDate).getTime()) ? new Date(eventDate) : new Date(),
    metadata: { githubType: event, action: event === "pull_request_review" ? "review" : action, actor, repo: payload.repository, commitCount: commits.length, commits, merged: payload.pull_request?.merged === true, title: payload.pull_request?.title ?? payload.issue?.title ?? null, reviewState: payload.review?.state ?? null },
    commits,
  };
}

export async function POST(request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  const delivery = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  if (!delivery || !event) return NextResponse.json({ error: "Missing delivery headers" }, { status: 400 });
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const repository = payload.repository;
  if (repository && ["repository", "create", "push"].includes(event)) {
    if (event === "repository" && payload.action === "deleted") {
      await prisma.repository.deleteMany({ where: { github_repo_id: repository.id } });
    } else if (event === "repository" && payload.action === "transferred") {
      await prisma.repository.deleteMany({ where: { github_repo_id: repository.id } });
      if (payload.repository?.owner?.login && await prisma.user.findUnique({ where: { github_username: payload.repository.owner.login }, select: { id: true } })) {
        await upsertRepository(payload.repository, payload.repository.owner.login);
      }
    } else {
      const existingRepos = await prisma.repository.findMany({ where: { github_repo_id: Number(repository.id) }, select: { user_id: true } });
      const ownerLogins = new Set(existingRepos.map((row) => row.user_id));
      if (ownerLogins.size === 0 && repository.owner?.login) ownerLogins.add(repository.owner.login);
      for (const ownerLogin of ownerLogins) {
        if (!await prisma.user.findUnique({ where: { github_username: ownerLogin }, select: { id: true } })) continue;
        await upsertRepository(repository, ownerLogin);
      }
    }
  }

  const activity = toActivity(event, payload, delivery);
  if (!activity) {
    logDelivery({ delivery, event, payload, decision: "ignored", reason: "unsupported-event" });
    return NextResponse.json({ ok: true, ignored: true, reason: "unsupported-event" });
  }

  // Attribute the event to a Pushr user. The GitHub sender wins, but when a
  // non-Pushr collaborator/owner acts we fall back to the repository owner so
  // the activity is still recorded against the account that connected GitHub.
  const user = await resolveActorUser(payload, activity.actor);
  if (!user) {
    logDelivery({ delivery, event, payload, decision: "ignored", reason: "no-pushr-user" });
    return NextResponse.json({ ok: true, ignored: true, reason: "no-pushr-user" });
  }
  if (activity.type === "PUSH") {
    const [owner, repoName] = String(repository?.full_name ?? "").split("/");
    const accessToken = await getGitHubAccessToken(user.id).catch(() => null);
    const ownCommits = [];
    if (owner && repoName && accessToken) {
      for (const pushedCommit of activity.commits) {
        const rawCommit = await getRepoCommitBySha(owner, repoName, pushedCommit.sha, accessToken);
        if (rawCommit?.author?.login?.toLowerCase() !== activity.actor.toLowerCase()) continue;
        const commit = toCommitRecord(rawCommit, repository.full_name);
        if (commit) ownCommits.push(commit);
      }
    }
    activity.commits = ownCommits;
    activity.metadata.commits = ownCommits;
    activity.metadata.commitCount = ownCommits.length;
    const ownRepositoryId = await findRepositoryId(Number(repository?.id), user.github_username);
    if (ownRepositoryId) await appendRepositoryCommits(ownRepositoryId, ownCommits);
  }
  const repositoryId = Number(repository?.id) > 0 ? await findRepositoryId(Number(repository.id), user.github_username) : null;
  const points = getActivityPoints(activity.type, activity.metadata);
  let storedActivity;
  try {
    storedActivity = await prisma.activity.create({ data: {
      user_id: user.id, type: activity.type, github_event_id: activity.id,
      repository_id: repositoryId, metadata: activity.metadata, points_awarded: points,
      created_at: activity.createdAt,
    } });
  } catch (error) {
    if (error?.code === "P2002") {
      logDelivery({ delivery, event, payload, decision: "duplicate", reason: "github_event_id", userId: user.id });
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[github/webhook] activity write failed", error);
    logDelivery({ delivery, event, payload, decision: "error", reason: "activity-write", userId: user.id });
    return NextResponse.json({ error: "Activity processing failed" }, { status: 500 });
  }

  const rivalry = await prisma.rivalry.findFirst({
    where: { status: "ACTIVE", OR: [{ user1_id: user.id }, { user2_id: user.id }], started_at: { lte: activity.createdAt }, ends_at: { gte: activity.createdAt } },
    select: { id: true, user1_id: true, user2_id: true },
  });
  if (rivalry) {
    await updateRivalryScore(rivalry.id);
    const recipientId = rivalry.user1_id === user.id ? rivalry.user2_id : rivalry.user1_id;
    await createRivalActivityNotification({
      recipientId,
      activityId: storedActivity.id,
      actor: activity.actor,
      type: activity.type,
      repositoryName: repository?.full_name ?? repository?.name,
    });
  }
  logDelivery({ delivery, event, payload, decision: "stored", userId: user.id });
  return NextResponse.json({ ok: true, stored: true, scored: Boolean(rivalry) });
}
