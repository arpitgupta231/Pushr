import { prisma } from "@/lib/prisma";
import { getUserData, getUserStarredCount, getMutualFollows } from "@/lib/github";
import { syncUserRepositories } from "@/lib/repos";
import { computeUserStats } from "@/lib/stats";

// Friend syncing is sync/domain logic, not a GitHub API client concern —
// github.js stays API-only and exposes getMutualFollows(); the database
// write happens here through the merged per-user update below. Fetches the
// mutual-follow lists, intersects them, and returns GitHub logins of mutual
// follows for the current sync pass. Returns null when either fetch failed
// (rate limit, network…) — null MUST skip the friends write so a failure
// never wipes good stored data. Empty array = genuinely no mutuals.
async function collectUserFriends(username, accessToken = null) {
  try {
    const mutuals = await getMutualFollows(username, 100, 5, accessToken);
    if (mutuals === null) return null;
    return mutuals.map((m) => m.login).filter(Boolean);
  } catch (e) {
    console.error(`[sync] friend collection failed for ${username}:`, e);
    return null;
  }
}

/**
 * Syncs all GitHub user data together for a given user:
 * - Profile stats (following count, starred repo count)
 * - Repositories (owned repos, via the single write owner lib/repos.js)
 * - Friends (mutual follows collected here, written into User.friends)
 * - Contribution streaks & total commits (computed by lib/stats.js)
 * - Stamps `last_synced_at: new Date()`
 *
 * All GitHub data is collected first, then applied in ONE coherent User-row
 * update — no intermediate partial writes from other modules.
 *
 * @param {object|string} user - User record (with id, github_username) or username string
 * @param {string|null} [accessToken=null] - Optional OAuth access token
 * @returns {Promise<object|null>} Updated user record or null on error
 */
export async function syncUserGitHubData(user, accessToken = null) {
  const username = typeof user === "string" ? user : user?.github_username;
  if (!username) return null;

  try {
    const dbUser =
      typeof user === "object" && user?.id
        ? user
        : await prisma.user.findUnique({ where: { github_username: username } });

    if (!dbUser) return null;

    // 1. Collect this pass's GitHub data — each source fails soft so one
    // broken fetch never blocks the others or the final update.
    const [userData, starredCount, friends, stats] = await Promise.all([
      getUserData(username, accessToken).catch((e) => {
        console.error(`[sync] getUserData failed for ${username}:`, e);
        return null;
      }),
      getUserStarredCount(username, accessToken).catch((e) => {
        console.error(`[sync] getUserStarredCount failed for ${username}:`, e);
        return 0;
      }),
      collectUserFriends(username, accessToken),
      computeUserStats(username, accessToken).catch((e) => {
        console.error(`[sync] computeUserStats failed for ${username}:`, e);
        return null;
      }),
    ]);

    // 2. Sync repositories — owned repos via the Repository write owner.
    await syncUserRepositories(username).catch((e) => {
      console.error(`[sync] syncUserRepositories failed for ${username}:`, e);
    });

    // 3. One coherent User-row update for everything collected above.
    const data = {
      following_count: userData?.following ?? dbUser.following_count ?? 0,
      starred_repo_count: starredCount ?? dbUser.starred_repo_count ?? 0,
      last_synced_at: new Date(),
    };
    if (stats) {
      data.current_streak = stats.current_streak;
      data.longest_streak = stats.longest_streak;
      data.total_commits = stats.total_commits;
    }
    // null friends keep the stored array intact (fetch failure);
    // an empty array is a genuine "no mutuals" result.
    if (friends) data.friends = friends;

    const updated = await prisma.user.update({
      where: { id: dbUser.id },
      data,
      select: {
        id: true,
        github_username: true,
        following_count: true,
        starred_repo_count: true,
        last_synced_at: true,
      },
    });

    return updated;
  } catch (error) {
    console.error(`[sync] syncUserGitHubData failed for ${username}:`, error);
    return null;
  }
}

// Persist freshly computed GitHub stats onto the User row — one coherent
// update, used by on-demand refresh paths (streak + rivalry endpoints) that
// run outside the cron sync pipeline. lib/stats.js stays pure computation;
// User-row writes stay in the sync domain. Returns false instead of writing
// when there are no stats or the login isn't a Pushr user — never throws.
export async function persistUserStats(githubUsername, stats) {
  if (!stats) return false;
  try {
    await prisma.user.update({
      where: { github_username: githubUsername },
      data: {
        current_streak: stats.current_streak,
        longest_streak: stats.longest_streak,
        total_commits: stats.total_commits,
      },
    });
    return true;
  } catch (e) {
    console.error(`[sync] persistUserStats failed for ${githubUsername}:`, e?.message ?? e);
    return false;
  }
}

/**
 * Determines which users need to be synced based on schedule:
 * - Active-rivalry users: synced every 5 minutes
 * - All other users: synced when their `last_synced_at` is null or older than 30 minutes
 *
 * @returns {Promise<{activeUsers: Array, periodicUsers: Array, usersToSync: Array}>}
 */
export async function getUsersDueForGeneralSync() {
  // 1. Active-rivalry users (synced every 5 minutes)
  const activeRivalries = await prisma.rivalry.findMany({
    where: { status: "ACTIVE" },
    select: {
      user1: { select: { id: true, github_username: true, github_access_token: true } },
      user2: { select: { id: true, github_username: true, github_access_token: true } },
    },
  });

  const activeMap = new Map();
  for (const r of activeRivalries) {
    if (r.user1) activeMap.set(r.user1.id, r.user1);
    if (r.user2) activeMap.set(r.user2.id, r.user2);
  }
  const activeUsers = Array.from(activeMap.values());
  const activeIds = Array.from(activeMap.keys());

  // 2. All other users: synced when last_synced_at is null or older than 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const periodicUsers = await prisma.user.findMany({
    where: {
      id: { notIn: activeIds },
      OR: [
        { last_synced_at: null },
        { last_synced_at: { lt: thirtyMinutesAgo } },
      ],
    },
    select: { id: true, github_username: true, github_access_token: true },
  });

  return {
    activeUsers,
    periodicUsers,
    usersToSync: [...activeUsers, ...periodicUsers],
  };
}

/**
 * Runs general user GitHub syncing for all users due in this cycle.
 *
 * @returns {Promise<{activeCount: number, periodicCount: number, totalSynced: number, results: Array}>}
 */
export async function syncGeneralUserData() {
  const { activeUsers, periodicUsers, usersToSync } = await getUsersDueForGeneralSync();
  const results = [];

  for (const user of usersToSync) {
    const res = await syncUserGitHubData(user, user.github_access_token ?? null);
    if (res) results.push(res);
  }

  return {
    activeCount: activeUsers.length,
    periodicCount: periodicUsers.length,
    totalSynced: results.length,
    results,
  };
}
