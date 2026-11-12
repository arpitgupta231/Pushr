import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getRepositoryById } from "@/lib/repos";
import { getRepoDetails, getRepoLanguages, getRepoContributors } from "@/lib/github";
import { getGitHubAccessToken } from "@/lib/github-token";
import { aggregateRepositoryInsights, deriveContributors } from "@/lib/repo-insights";
import RepositoryDetailClient from "./RepositoryDetailClient";

export const revalidate = 300;

export default async function RepositoryDetailPage({ params }) {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    redirect("/login");
  }

  const { repositoryId } = await params;
  if (!repositoryId) {
    notFound();
  }

  // Load repository directly from PostgreSQL
  const repository = await getRepositoryById(repositoryId, githubUsername);
  if (!repository) {
    // If not found for current user, check if it exists at all
    const existsAny = await getRepositoryById(repositoryId);
    if (!existsAny) {
      notFound();
    }
    // Unauthorized access to another user's private repository record
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-300">
        <h1 className="text-2xl font-bold text-red-400">Access Denied</h1>
        <p className="mt-2 text-sm text-zinc-400">You do not have permission to view this repository.</p>
        <a
          href="/dashboard"
          className="mt-6 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  const [owner, repoName] = (repository.full_name ?? "").split("/");

  // Fetch token for supplemental GitHub REST enrichment
  const dbUser = session.user?.id ? { id: session.user.id } : null;
  const accessToken = dbUser ? await getGitHubAccessToken(dbUser.id).catch(() => null) : null;

  // Supplementary REST metadata (cached with next: { revalidate: 300 })
  const [ghDetails, ghLanguages, ghContributors] = await Promise.all([
    owner && repoName ? getRepoDetails(owner, repoName, accessToken) : null,
    owner && repoName ? getRepoLanguages(owner, repoName, accessToken) : {},
    owner && repoName ? getRepoContributors(owner, repoName, accessToken) : [],
  ]);

  // Aggregate commits into quarters, metrics, and insights
  const currentYear = new Date().getUTCFullYear();
  const insights = aggregateRepositoryInsights(repository.commits, currentYear);
  const contributors = deriveContributors(repository.commits, ghContributors);

  const serializedRepo = {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description ?? ghDetails?.description ?? null,
    language: repository.language ?? ghDetails?.language ?? null,
    isFork: repository.is_fork ?? ghDetails?.fork ?? false,
    isContributor: repository.is_contributor ?? false,
    githubUrl: repository.github_url ?? ghDetails?.html_url ?? `https://github.com/${repository.full_name}`,
    private: repository.private ?? ghDetails?.private ?? false,
    archived: repository.archived ?? ghDetails?.archived ?? false,
    defaultBranch: repository.default_branch ?? ghDetails?.default_branch ?? "main",
    pushedAt: repository.pushed_at?.toISOString() ?? ghDetails?.pushed_at ?? null,
    createdAt: repository.github_created_at?.toISOString() ?? ghDetails?.created_at ?? null,
    updatedAt: repository.updated_at?.toISOString() ?? ghDetails?.updated_at ?? null,
    starsCount: ghDetails?.stargazers_count ?? 0,
    forksCount: ghDetails?.forks_count ?? 0,
    openIssuesCount: ghDetails?.open_issues_count ?? 0,
    watchersCount: ghDetails?.subscribers_count ?? ghDetails?.watchers_count ?? 0,
    license: ghDetails?.license?.spdx_id || ghDetails?.license?.name || null,
    topics: ghDetails?.topics ?? [],
    ownerLogin: owner || repository.user_id,
    commits: repository.commits ?? [],
  };

  return (
    <RepositoryDetailClient
      repository={serializedRepo}
      insights={insights}
      contributors={contributors}
      languages={ghLanguages}
    />
  );
}
