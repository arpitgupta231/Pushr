import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserContributionDays, getUserData } from "@/lib/github";
import { toChartCommits } from "@/lib/commits";
import DashboardClient from "./DashboardClient";

// Cache the dashboard for 5 minutes. Commit charts are read from PostgreSQL
// (Repository.commits), so this does not fetch commit history from GitHub.
export const revalidate = 300;

// Server Component: verifies the session username against the DB,
// then fetches all dashboard data directly from Postgres.
// GitHub syncing is handled by the cron job (lib/sync.js) plus the one-time
// repository history import at sign-in. Commit charts never call GitHub.
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    return null;
  }

  // Verify that the username exists in our DB. No email fallback —
  // the session username is the single source of truth.
  const dbUser = await prisma.user.findUnique({
    where: { github_username: githubUsername },
  });

  if (!dbUser) {
    return null;
  }

  // Fetch everything for this verified user directly from the DB,
  // plus the GitHub avatar + bio for the sidebar / profile card.
  const [dbRepos, dbActivities, dbRivalry, githubProfile] = await Promise.all([
    prisma.repository.findMany({
      where: { user_id: dbUser.github_username },
      orderBy: { github_created_at: "desc" },
      take: 20,
      select: {
        name: true,
        full_name: true,
        description: true,
        language: true,
        is_fork: true,
        github_url: true,
        github_created_at: true,
        commits: true,
      },
    }),
    prisma.activity.findMany({
      where: { user_id: dbUser.id },
      orderBy: { created_at: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        points_awarded: true,
        created_at: true,
        repository_id: true,
      },
    }),
    prisma.rivalry.findFirst({
      where: {
        status: "ACTIVE",
        OR: [{ user1_id: dbUser.id }, { user2_id: dbUser.id }],
      },
      include: {
        user1: { select: { github_username: true } },
        user2: { select: { github_username: true } },
      },
    }),
    // GitHub profile for the avatar + bio. Never blocks the dashboard —
    // avatar falls back to the session image, then to the local placeholder.
    getUserData(githubUsername)
      .then((d) => ({
        avatarUrl: d?.avatar_url ?? null,
        bio: d?.bio ?? null,
      }))
      .catch(() => ({ avatarUrl: null, bio: null })),
  ]);

  const user = {
    id: dbUser.id,
    githubUsername: dbUser.github_username,
    avatarUrl: githubProfile.avatarUrl ?? session.user.image ?? null,
    bio: githubProfile.bio,
    email: dbUser.email,
    following_count: dbUser.following_count,
    starred_repo_count: dbUser.starred_repo_count,
    total_commits: dbUser.total_commits,
    current_streak: dbUser.current_streak,
    longest_streak: dbUser.longest_streak,
  };

  const repositories = dbRepos.map((repo) => ({
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    language: repo.language,
    isFork: repo.is_fork,
    githubUrl: repo.github_url,
    commits: toChartCommits(repo.commits),
  }));

  const activities = dbActivities.map((a) => ({
    id: a.id,
    type: a.type,
    points_awarded: a.points_awarded,
    created_at: a.created_at.toISOString(),
    repository_id: a.repository_id,
  }));

  // Year-wide contribution calendar via GraphQL for the profile heatmap.
  // Uses the stored server-side OAuth token (private contribs included);
  // falls back to GITHUB_TOKEN inside the fetcher. Never blocks the dashboard.
  const currentYear = new Date().getFullYear();
  const accessToken = dbUser.github_access_token ?? null;
  const contributions = await getUserContributionDays(
    githubUsername,
    `${currentYear}-01-01T00:00:00Z`,
    `${currentYear}-12-31T23:59:59Z`,
    accessToken
  ).catch(() => ({ days: [], total: 0 }));

  // Friends are read-only from the DB — the cron job (lib/sync.js)
  // handles syncing mutual follows. No GitHub API calls here.
  const friendsDisplay = (dbUser.friends ?? []).map((login) => ({
    login,
    avatarUrl: null,
  }));

  const rivalry = dbRivalry
    ? {
        id: dbRivalry.id,
        status: dbRivalry.status,
        user1_score: dbRivalry.user1_score,
        user2_score: dbRivalry.user2_score,
        rivalry_score: dbRivalry.rivalry_score,
        ends_at: dbRivalry.ends_at?.toISOString() ?? null,
        user1_username: dbRivalry.user1.github_username,
        user2_username: dbRivalry.user2.github_username,
      }
    : null;

  return (
    <DashboardClient
      user={user}
      repositories={repositories}
      activities={activities}
      rivalry={rivalry}
      contributionDays={contributions.days}
      contributionTotal={contributions.total}
      contributionYear={currentYear}
      friends={friendsDisplay}
    />
  );
}
