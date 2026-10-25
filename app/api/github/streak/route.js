import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { persistUserStats } from "@/lib/sync";
import { computeUserStats } from "@/lib/stats";

// GET /api/github/streak?username=<login>
// GitHub activity streaks counted from the contribution calendar (same source
// as the heatmap). `username` defaults to the session user — whose private
// contributions the session token can see; any other login resolves to their
// public contributions.
//
// The longest streak is counted over the user's full history (account
// creation till date). Both streaks plus the year's total contributions are
// persisted to the user's DB row. When GitHub is unreachable, last-known DB
// values are returned with `stale: true` instead of failing.
export async function GET(request) {
  const session = await getServerSession(authOptions);
  const viewer = session?.user?.githubUsername?.trim() || null;

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim() || viewer;
  const accessToken = session?.accessToken ?? null;

  const fresh = await computeUserStats(username, accessToken);
  if (fresh) {
    const persisted = await persistUserStats(username, fresh);
    return NextResponse.json({
      username,
      year: fresh.year,
      current_streak: fresh.current_streak,
      longest_streak: fresh.longest_streak,
      last_active_date: fresh.last_active_date,
      active_today: fresh.active_today,
      total_contributions: fresh.total_commits,
      total_contributions_all_time: fresh.total_all_time,
      persisted,
    });
  }

  const stored = await prisma.user
    .findUnique({ where: { github_username: username } })
    .catch(() => null);

  return NextResponse.json({
    username,
    year: new Date().getFullYear(),
    current_streak: stored?.current_streak ?? 0,
    longest_streak: stored?.longest_streak ?? 0,
    last_active_date: null,
    active_today: false,
    total_contributions: stored?.total_commits ?? 0,
    total_contributions_all_time: 0,
    stale: true,
    persisted: false,
  });
}
