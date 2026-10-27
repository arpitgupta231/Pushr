import { prisma } from "@/lib/prisma";
import { getUserEvents, toActivityRow } from "@/lib/github";
import { getActivityPoints } from "@/lib/rivalry";
import { findRepositoryId } from "@/lib/repos";

/**
 * Links an activity to a repository that already exists in PostgreSQL.
 * lib/repos.js is the only creator of repository records — activities never
 * mint partial skeletons — so an event for an unsynced repo simply stays
 * unlinked (repository_id null) until the owner's repo sync writes the
 * proper record.
 */
async function resolveRepositoryId(row) {
  const repo = row.metadata?.repo ?? {};
  const githubId = Number(repo.id);
  if (!Number.isInteger(githubId) || githubId <= 0) return null;
  return findRepositoryId(githubId);
}

/**
 * Fetches recent events from GitHub Events REST API for a single user and stores new activities.
 * Deduplicates using Activity.github_event_id.
 *
 * @param {object} user - User record with { id, github_username, github_access_token }
 * @param {object} [options]
 * @param {boolean} [options.awardPoints=true] - When false, events are stored with 0 points
 *   (non-rival ingestion: activity history only, never rivalry scoring)
 * @returns {Promise<object>} Summary of the sync run
 */
export async function syncUserActivities(user, options = {}) {
  const awardPoints = options.awardPoints !== false;
  const summary = {
    username: user.github_username,
    fetched: 0,
    stored: 0,
    duplicates: 0,
    unsupported: 0,
    errors: 0,
  };

  let events = [];
  try {
    events = await getUserEvents(
      user.github_username,
      30,
      user.github_access_token ?? null
    );
  } catch (err) {
    console.error(`[activity] Failed to fetch events for ${user.github_username}:`, err);
    summary.error = "fetch failed";
    return summary;
  }
  summary.fetched = events.length;

  for (const event of events) {
    const row = toActivityRow(event);
    if (!row) {
      summary.unsupported += 1;
      continue;
    }

    const repository_id = await resolveRepositoryId(row).catch(() => null);
    const basePoints = awardPoints ? getActivityPoints(row.type, row.metadata) : 0;

    try {
      await prisma.activity.create({
        data: {
          ...row,
          user_id: user.id,
          repository_id,
          points_awarded: basePoints,
        },
      });
      summary.stored += 1;
    } catch (e) {
      // P2002: unique constraint on github_event_id prevents duplicate events
      if (e?.code === "P2002") {
        summary.duplicates += 1;
      } else {
        summary.errors += 1;
        console.error(`[activity] Error storing activity for ${user.github_username}:`, e);
      }
    }
  }

  return summary;
}

/**
 * Polls the GitHub Events REST API for users and stores new activities.
 *
 * @param {object} [options]
 * @param {boolean} [options.onlyActive=false] - If true, only sync users in active rivalries
 * @returns {Promise<Array<object>>} Sync results per user
 */
export async function syncAllUserActivities(options = {}) {
  let users = [];

  if (options.onlyActive) {
    const activeRivalries = await prisma.rivalry.findMany({
      where: { status: "ACTIVE" },
      select: {
        user1: { select: { id: true, github_username: true, github_access_token: true } },
        user2: { select: { id: true, github_username: true, github_access_token: true } },
      },
    });

    const userMap = new Map();
    for (const r of activeRivalries) {
      if (r.user1) userMap.set(r.user1.id, r.user1);
      if (r.user2) userMap.set(r.user2.id, r.user2);
    }
    users = Array.from(userMap.values());
  } else {
    users = await prisma.user.findMany({
      select: { id: true, github_username: true, github_access_token: true },
    });
  }

  const results = [];
  for (const user of users) {
    const res = await syncUserActivities(user);
    results.push(res);
  }

  return results;
}
