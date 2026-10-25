import { countContributionStreaks, getUserContributionCalendar, getUserCreatedAt } from "@/lib/github";

// Recompute a user's GitHub activity stats from the contribution calendar:
// current_streak + longest_streak (full history, account creation till date,
// read in year-wide chunks — a single giant range times out) and total_commits
// (this year's contributions). Pure computation — no DB writes; persisting is
// owned by the sync domain (lib/sync.js), which merges these into its single
// coherent User-row update. On-demand callers outside the cron (streak /
// rivalry endpoints) persist via persistUserStats().
//
// Returns { current_streak, longest_streak, total_commits, total_all_time,
// last_active_date, active_today, year } — or null when GitHub is unreadable
// (any calendar chunk failing, etc.), so callers fall back to stored DB values
// instead of writing zeros over real stats. Every failure path logs
// server-side. Never throws.
export async function computeUserStats(githubUsername, accessToken) {
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

    return {
      current_streak,
      longest_streak,
      total_commits,
      total_all_time,
      last_active_date,
      active_today,
      year,
    };
  } catch (e) {
    console.error(`[stats] refresh ${githubUsername} threw:`, e?.message ?? e);
    return null;
  }
}
