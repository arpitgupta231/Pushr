import { prisma } from "@/lib/prisma";
import { countContributionStreaks, getUserContributionCalendar, getUserCreatedAt } from "@/lib/github";

// Recompute a user's GitHub activity stats from the contribution calendar and
// persist them to their DB row: current_streak + longest_streak (full history,
// account creation till date, read in year-wide chunks — a single giant range
// times out) and total_commits (this year's contributions).
//
// Returns { current_streak, longest_streak, total_commits, total_all_time,
// last_active_date, active_today, year, persisted } — or null when GitHub is
// unreachable, so callers fall back to stored DB values instead of persisting
// zeros over real stats. `persisted` is false when the login isn't on Pushr
// (fresh numbers still returned). Every failure path logs server-side.
export async function refreshUserStats(githubUsername, accessToken) {
  const year = new Date().getFullYear();
  try {
    const createdAt = await getUserCreatedAt(githubUsername, accessToken).catch(() => null);
    const startYear = createdAt ? new Date(createdAt).getUTCFullYear() : year;
    if (!createdAt) {
      console.error(`[stats] refresh ${githubUsername}: no createdAt, longest degrades to year-bounded`);
    }
    const years = [];
    for (let y = startYear; y <= year; y++) years.push(y);

    const results = await Promise.all(
      years.map((y) =>
        getUserContributionCalendar(
          githubUsername,
          `${y}-01-01T00:00:00Z`,
          y === year ? new Date().toISOString() : `${y}-12-31T23:59:59Z`,
          accessToken
        ).catch(() => ({ ok: false, days: [], total: 0 }))
      )
    );

    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      console.error(`[stats] refresh ${githubUsername}: ${failed}/${results.length} calendar reads failed — keeping stored values`);
      return null;
    }

    const days = results
      .flatMap((r) => r.days)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const { current_streak, longest_streak, last_active_date, active_today } =
      countContributionStreaks(days);
    // The current-year chunk runs Jan 1 → now, so its total IS the year total.
    const total_commits = results[results.length - 1]?.total ?? 0;
    const total_all_time = results.reduce((sum, r) => sum + r.total, 0);

    let persisted = false;
    try {
      await prisma.user.update({
        where: { github_username: githubUsername },
        data: { current_streak, longest_streak, total_commits },
      });
      persisted = true;
    } catch (e) {
      console.error(`[stats] refresh ${githubUsername}: DB update failed:`, e?.message ?? e);
    }

    return {
      current_streak,
      longest_streak,
      total_commits,
      total_all_time,
      last_active_date,
      active_today,
      year,
      persisted,
    };
  } catch (e) {
    console.error(`[stats] refresh ${githubUsername} threw:`, e?.message ?? e);
    return null;
  }
}
