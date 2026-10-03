import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserContributionDays, getUserData } from "@/lib/github";
import { refreshUserStats } from "@/lib/stats";

// Returns the session user's ACTIVE rivalry, or { rivalry: null }.
// Both participants are enriched with personal stats, a year-wide
// contribution calendar (feeds the heatmap), and their most active repo
// inside the rivalry window (by tracked activity count).
export async function GET() {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    return NextResponse.json({ rivalry: null }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { github_username: githubUsername },
  });

  if (!dbUser) {
    return NextResponse.json({ rivalry: null }, { status: 404 });
  }

  const userSelect = {
    id: true,
    github_username: true,
    total_commits: true,
    current_streak: true,
    longest_streak: true,
    following_count: true,
    starred_repo_count: true,
  };

  const rivalry = await prisma.rivalry.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ user1_id: dbUser.id }, { user2_id: dbUser.id }],
    },
    include: {
      user1: { select: userSelect },
      user2: { select: userSelect },
    },
  });

  if (!rivalry) {
    return NextResponse.json({ rivalry: null });
  }

  const year = new Date().getFullYear();
  // Viewer's OAuth token: own private contributions included; the rival's
  // calendar resolves to their public contributions. Never throws.
  const accessToken = session?.accessToken ?? null;
  const [user1, user2] = await Promise.all([
    buildUserView(rivalry.user1, rivalry.started_at, accessToken, year),
    buildUserView(rivalry.user2, rivalry.started_at, accessToken, year),
  ]);

  return NextResponse.json({
    rivalry: {
      id: rivalry.id,
      status: rivalry.status,
      user1_score: rivalry.user1_score,
      user2_score: rivalry.user2_score,
      rivalry_score: rivalry.rivalry_score,
      started_at: rivalry.started_at?.toISOString() ?? null,
      ends_at: rivalry.ends_at?.toISOString() ?? null,
      user1_username: rivalry.user1.github_username,
      user2_username: rivalry.user2.github_username,
      user1,
      user2,
    },
  });
}

async function buildUserView(user, rivalryStartedAt, accessToken, year) {
  const [topGroups, contributions, refreshed, profile] = await Promise.all([
    prisma.activity
      .groupBy({
        by: ["repository_id"],
        where: {
          user_id: user.id,
          repository_id: { not: null },
          ...(rivalryStartedAt ? { created_at: { gte: rivalryStartedAt } } : {}),
        },
        _count: { repository_id: true },
        _max: { created_at: true },
        orderBy: { _count: { repository_id: "desc" } },
        take: 1,
      })
      .catch(() => []),
    getUserContributionDays(
      user.github_username,
      `${year}-01-01T00:00:00Z`,
      `${year}-12-31T23:59:59Z`,
      accessToken
    ).catch(() => ({ days: [], total: 0 })),
    // Fresh GitHub stats, persisted to the DB row; falls back to the stored
    // values below when GitHub is unreachable.
    refreshUserStats(user.github_username, accessToken),
    // Profile for the avatar URL — null falls back to a letter medallion.
    getUserData(user.github_username, accessToken).catch(() => null),
  ]);

  let featured_repo = null;
  const top = topGroups[0];
  if (top?.repository_id) {
    const repo = await prisma.repository
      .findUnique({ where: { id: top.repository_id } })
      .catch(() => null);
    if (repo) {
      featured_repo = {
        name: repo.name,
        full_name: repo.full_name,
        language: repo.language,
        github_url: repo.github_url,
        activity_count: top._count?.repository_id ?? 0,
        last_activity_at: top._max?.created_at?.toISOString() ?? null,
      };
    }
  }

  return {
    username: user.github_username,
    avatar_url: profile?.avatar_url ?? null,
    total_commits: refreshed?.total_commits ?? user.total_commits,
    current_streak: refreshed?.current_streak ?? user.current_streak,
    longest_streak: refreshed?.longest_streak ?? user.longest_streak,
    following_count: user.following_count,
    starred_repo_count: user.starred_repo_count,
    contributions: { days: contributions.days, total: contributions.total, year },
    featured_repo,
  };
}
