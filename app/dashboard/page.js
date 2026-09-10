import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRepoCommits } from "@/lib/github";
import DashboardClient from "./DashboardClient";

// Cache the dashboard (incl. GitHub commit fetches) for 5 minutes
// so every page load doesn't burn through the Events/commits rate limit.
export const revalidate = 300;

// Shape a raw GET /repos/{owner}/{repo}/commits entry into what
// ChartContainer expects: { sha, message, date, branch }.
// The commits endpoint carries no branch info, so everything maps to
// "main" for V1 (single-lane graph). Reversed to oldest → newest so the
// graph reads left-to-right.
function toChartCommits(rawCommits) {
  return [...rawCommits]
    .reverse()
    .map((c) => ({
      sha: c.sha?.slice(0, 7) ?? "unknown",
      message: c.commit?.message?.split("\n")[0]?.slice(0, 80) || "commit",
      date: c.commit?.author?.date?.slice(0, 10) ?? "",
      branch: "main",
    }));
}

// Server Component: verifies the session username against the DB,
// then fetches all dashboard data directly from Postgres.
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  // 1. Verify identity strictly through session info.
  const githubUsername = session?.user?.githubUsername?.trim() || null;
  if (!githubUsername) {
    redirect("/login");
  }

  // 2. Verify that username exists in our DB. No email fallback —
  // the session username is the single source of truth.
  const dbUser = await prisma.user.findUnique({
    where: { github_username: githubUsername },
  });

  if (!dbUser) {
    redirect("/login");
  }

  // 3. Fetch everything for this verified user directly from the DB.
  const [dbRepos, dbActivities, dbRivalry] = await Promise.all([
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
  ]);

  const user = {
    id: dbUser.id,
    githubUsername: dbUser.github_username,
    email: dbUser.email,
    following_count: dbUser.following_count,
    starred_repo_count: dbUser.starred_repo_count,
    total_commits: dbUser.total_commits,
    current_streak: dbUser.current_streak,
    longest_streak: dbUser.longest_streak,
  };

  // Fetch commit history from GitHub for each repo, then hand the shaped
  // commits to the client → ChartContainer. Failures resolve to [] so one
  // private/empty/rate-limited repo never breaks the whole dashboard.
  const commitResults = await Promise.allSettled(
    dbRepos.map((repo) => {
      const [owner, repoName] = (repo.full_name || "").split("/");
      if (!owner || !repoName) return Promise.resolve([]);
      return getRepoCommits(owner, repoName, 30);
    })
  );

  const repositories = dbRepos.map((repo, i) => {
    const settled = commitResults[i];
    const raw = settled.status === "fulfilled" ? settled.value : [];
    return {
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      language: repo.language,
      isFork: repo.is_fork,
      githubUrl: repo.github_url,
      commits: toChartCommits(raw),
    };
  });

  const activities = dbActivities.map((a) => ({
    id: a.id,
    type: a.type,
    points_awarded: a.points_awarded,
    created_at: a.created_at.toISOString(),
    repository_id: a.repository_id,
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
    />
  );
}
