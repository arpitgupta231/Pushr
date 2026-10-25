import { prisma } from "@/lib/prisma";

/**
 * Scoring Rules for Pushr:
 * - Commit: +1 (capped at 10 points per calendar day per user)
 * - PR opened: +5
 * - PR merged: +10
 * - PR review: +3
 * - Issue opened: +2
 * - Issue closed: +3
 * - Release: +5
 * - Stars, follows, forks, branches, and profile changes are NOT scored (0 points).
 */
export const SCORING_POINTS = {
  COMMIT: 1,
  PR_OPENED: 5,
  PR_MERGED: 10,
  PR_REVIEW: 3,
  ISSUE_OPENED: 2,
  ISSUE_CLOSED: 3,
  RELEASE: 5,
  DAILY_COMMIT_CAP: 10,
};

/**
 * Determines the point value for a single GitHub activity based on its type and metadata.
 *
 * @param {string} type - ActivityType (e.g. "PUSH", "PR", "MERGE", "ISSUE", "CREATE_REPO") or direct token
 * @param {object} [metadata] - Activity metadata payload
 * @returns {number} Points to award
 */
export function getActivityPoints(type, metadata = {}) {
  if (!type) return 0;
  const action = (metadata?.action || "").toLowerCase();
  const githubType = metadata?.githubType || "";

  // 1. Commits (+1 per commit)
  if (type === "PUSH" || type === "COMMIT") {
    const count = Number(metadata?.commitCount ?? metadata?.commits?.length ?? 1);
    return Math.max(0, count) * SCORING_POINTS.COMMIT;
  }

  // 2. PR Review (+3)
  if (
    type === "PR_REVIEW" ||
    action === "review" ||
    githubType === "PullRequestReviewEvent"
  ) {
    return SCORING_POINTS.PR_REVIEW;
  }

  // 3. PR Merged (+10)
  if (
    type === "MERGE" ||
    type === "PR_MERGED" ||
    (type === "PR" && (metadata?.merged === true || action === "merged" || (action === "closed" && metadata?.merged === true)))
  ) {
    return SCORING_POINTS.PR_MERGED;
  }

  // 4. PR Opened (+5)
  if (
    type === "PR_OPENED" ||
    (type === "PR" && action === "opened")
  ) {
    return SCORING_POINTS.PR_OPENED;
  }

  // 5. Release (+5)
  if (
    type === "RELEASE" ||
    action === "release" ||
    githubType === "ReleaseEvent"
  ) {
    return SCORING_POINTS.RELEASE;
  }

  // 6. Issue Opened (+2) & Closed (+3)
  if (type === "ISSUE_OPENED" || (type === "ISSUE" && action === "opened")) {
    return SCORING_POINTS.ISSUE_OPENED;
  }
  if (type === "ISSUE_CLOSED" || (type === "ISSUE" && action === "closed")) {
    return SCORING_POINTS.ISSUE_CLOSED;
  }

  // Unscored: stars, forks, repo creation, profile/branch events
  return 0;
}

/**
 * Calculates a user's total score within a rivalry window.
 * Only activities on or after `startedAt` (and on or before `endsAt` if provided) are counted.
 * Enforces the 10 commit points per calendar day (UTC) cap.
 *
 * @param {string} userId - User ID
 * @param {Date} startedAt - Rivalry start date
 * @param {Date|null} [endsAt] - Optional rivalry end date
 * @returns {Promise<number>} Total rivalry points for the user
 */
export async function calculateUserRivalryScore(userId, startedAt, endsAt = null) {
  if (!userId || !startedAt) return 0;

  const activities = await prisma.activity.findMany({
    where: {
      user_id: userId,
      created_at: {
        gte: startedAt,
        ...(endsAt ? { lte: endsAt } : {}),
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      metadata: true,
      created_at: true,
    },
  });

  let totalScore = 0;
  // Maps UTC date key "YYYY-MM-DD" -> commit points awarded on that calendar day
  const dailyCommitPoints = new Map();

  for (const act of activities) {
    const isPush = act.type === "PUSH" || act.type === "COMMIT";
    if (isPush) {
      const dateKey = act.created_at.toISOString().slice(0, 10);
      const rawCommits = Number(act.metadata?.commitCount ?? act.metadata?.commits?.length ?? 1);
      const alreadyAwarded = dailyCommitPoints.get(dateKey) || 0;
      const allowed = Math.max(0, SCORING_POINTS.DAILY_COMMIT_CAP - alreadyAwarded);
      const toAward = Math.min(rawCommits * SCORING_POINTS.COMMIT, allowed);
      dailyCommitPoints.set(dateKey, alreadyAwarded + toAward);
      totalScore += toAward;
    } else {
      const pts = getActivityPoints(act.type, act.metadata);
      totalScore += pts;
    }
  }

  return totalScore;
}

/**
 * Calculates both users' scores and updates the Rivalry record in PostgreSQL.
 *
 * user1_score = user1's points after started_at
 * user2_score = user2's points after started_at
 * rivalry_score = user1_score + user2_score
 *
 * @param {string} rivalryId - Rivalry ID
 * @returns {Promise<object|null>} Updated Rivalry record
 */
export async function updateRivalryScore(rivalryId) {
  if (!rivalryId) return null;

  const rivalry = await prisma.rivalry.findUnique({
    where: { id: rivalryId },
    select: {
      id: true,
      status: true,
      user1_id: true,
      user2_id: true,
      started_at: true,
      ends_at: true,
      user1_score: true,
      user2_score: true,
      rivalry_score: true,
    },
  });

  if (!rivalry) return null;

  // If rivalry hasn't started yet, scores remain 0
  if (!rivalry.started_at) {
    return rivalry;
  }

  const [user1Score, user2Score] = await Promise.all([
    calculateUserRivalryScore(rivalry.user1_id, rivalry.started_at, rivalry.ends_at),
    calculateUserRivalryScore(rivalry.user2_id, rivalry.started_at, rivalry.ends_at),
  ]);

  const rivalryScore = user1Score + user2Score;

  const updated = await prisma.rivalry.update({
    where: { id: rivalryId },
    data: {
      user1_score: user1Score,
      user2_score: user2Score,
      rivalry_score: rivalryScore,
    },
    select: {
      id: true,
      status: true,
      user1_id: true,
      user2_id: true,
      user1_score: true,
      user2_score: true,
      rivalry_score: true,
      started_at: true,
      ends_at: true,
    },
  });

  return updated;
}

/**
 * Calculates and updates scores for all ACTIVE rivalries.
 *
 * @returns {Promise<Array<object>>} Array of updated rivalry records
 */
export async function updateAllRivalryScores() {
  const activeRivalries = await prisma.rivalry.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const results = [];
  for (const r of activeRivalries) {
    try {
      const updated = await updateRivalryScore(r.id);
      if (updated) results.push(updated);
    } catch (err) {
      console.error(`[rivalry] Failed to update score for rivalry ${r.id}:`, err);
    }
  }

  return results;
}
