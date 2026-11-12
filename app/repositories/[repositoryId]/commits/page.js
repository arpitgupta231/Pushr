import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getRepositoryById } from "@/lib/repos";
import { getRepoDetails, getRepoContributors, getRepoCommitsPage, toCommitRecord } from "@/lib/github";
import { getGitHubAccessToken } from "@/lib/github-token";
import { deriveContributors, normalizeCommits } from "@/lib/repo-insights";
import { mergeCommits } from "@/lib/commits";
import RepositoryCommitsClient from "./RepositoryCommitsClient";

export const revalidate = 120;

export default async function RepositoryCommitsPage({ params }) {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    redirect("/login");
  }

  const { repositoryId } = await params;
  if (!repositoryId) {
    notFound();
  }

  const repository = await getRepositoryById(repositoryId, githubUsername);
  if (!repository) {
    const existsAny = await getRepositoryById(repositoryId);
    if (!existsAny) {
      notFound();
    }
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-[#07090e] p-6 text-center text-zinc-300">
        <h1 className="text-2xl font-bold text-red-400">Access Denied</h1>
        <p className="mt-2 text-sm text-zinc-400">You do not have permission to view commits for this repository.</p>
        <a
          href="/dashboard"
          className="mt-6 rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  const [owner, repoName] = (repository.full_name ?? "").split("/");

  const dbUser = session.user?.id ? { id: session.user.id } : null;
  const accessToken = dbUser ? await getGitHubAccessToken(dbUser.id).catch(() => null) : null;

  const [ghDetails, ghContributors, commitsResult] = await Promise.all([
    owner && repoName ? getRepoDetails(owner, repoName, accessToken) : null,
    owner && repoName ? getRepoContributors(owner, repoName, accessToken) : [],
    owner && repoName
      ? getRepoCommitsPage(owner, repoName, { perPage: 100, page: 1, accessToken })
      : { ok: true, commits: [] },
  ]);

  const ghCommits = (commitsResult.ok && Array.isArray(commitsResult.commits))
    ? commitsResult.commits.map((c) => toCommitRecord(c, repository.full_name)).filter(Boolean)
    : [];

  const dbCommits = normalizeCommits(repository.commits ?? []);
  const mergedCommits = mergeCommits(ghCommits, dbCommits);
  const contributors = deriveContributors(mergedCommits, ghContributors);

  const initialCommits = mergedCommits.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.message ?? "",
    author: c.author ?? "unknown",
    avatar_url: c.avatar_url ?? null,
    committed_at: c.committed_at ?? null,
    url: c.url ?? `https://github.com/${repository.full_name}/commit/${c.sha}`,
  }));

  const serializedRepo = {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description ?? ghDetails?.description ?? null,
    language: repository.language ?? ghDetails?.language ?? null,
    private: repository.private ?? ghDetails?.private ?? false,
    defaultBranch: repository.default_branch ?? ghDetails?.default_branch ?? "main",
    githubUrl: repository.github_url ?? ghDetails?.html_url ?? `https://github.com/${repository.full_name}`,
    ownerLogin: owner || repository.user_id,
    totalCommitsEstimate: ghDetails?.commits_count ?? mergedCommits.length,
  };

  return (
    <RepositoryCommitsClient
      repository={serializedRepo}
      initialCommits={initialCommits}
      contributors={contributors}
      hasMoreCommits={(commitsResult.commits?.length ?? 0) === 100}
    />
  );
}
