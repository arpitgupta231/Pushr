import { prisma } from "@/lib/prisma";
import { getUserData, getUserStarredCount, getMutualFollows } from "@/lib/github";
import { syncUserRepositories } from "@/lib/repos";
import { computeUserStats } from "@/lib/stats";

// Friend syncing is sync/domain logic, not a GitHub API client concern â€”
// github.js stays API-only and exposes getMutualFollows(); the database
// write happens here through the merged per-user update below. Fetches the
// mutual-follow lists, intersects them, and returns GitHub logins of mutual
// follows for the current sync pass. Returns null when either fetch failed
// (rate limit, networkâ€¦) â€” null MUST skip the friends write so a failure
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
 * update â€” no intermediate partial writes from other modules.
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

    // 1. Collect this pass's GitHub data â€” each source fails soft so one
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

    // 2. Sync repositories â€” owned repos via the Repository write owner.
    let repositoriesSynced = 0;
    let repositorySyncError = null;
    try {
      repositoriesSynced = await syncUserRepositories(username, accessToken);
    } catch (e) {
      console.error(`[sync] syncUserRepositories failed for ${username}:`, e);
      repositorySyncError = e?.message ?? "Repository sync failed";
    }

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

    return { ...updated, repositories_synced: repositoriesSynced, repository_sync_error: repositorySyncError };
  } catch (error) {
    console.error(`[sync] syncUserGitHubData failed for ${username}:`, error);
    return null;
  }
}

// Persist freshly computed GitHub stats onto the User row â€” one coherent
// update, used by on-demand refresh paths (streak + rivalry endpoints) that
// run outside the server sync path. lib/stats.js stays pure computation;
// User-row writes stay in the sync domain. Returns false instead of writing
// when there are no stats or the login isn't a Pushr user â€” never throws.
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
