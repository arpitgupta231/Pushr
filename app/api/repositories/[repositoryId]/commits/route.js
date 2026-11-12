import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getRepositoryById } from "@/lib/repos";
import { getRepoCommitsPage, toCommitRecord } from "@/lib/github";
import { getGitHubAccessToken } from "@/lib/github-token";

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { repositoryId } = await params;
  if (!repositoryId) {
    return NextResponse.json({ error: "Repository ID is required" }, { status: 400 });
  }

  const repository = await getRepositoryById(repositoryId, githubUsername);
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  const [owner, repoName] = (repository.full_name ?? "").split("/");
  if (!owner || !repoName) {
    return NextResponse.json({ error: "Invalid repository configuration" }, { status: 400 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("perPage") || "50", 10)));
  const author = url.searchParams.get("author") || null;

  const dbUser = session.user?.id ? { id: session.user.id } : null;
  const accessToken = dbUser ? await getGitHubAccessToken(dbUser.id).catch(() => null) : null;

  try {
    const result = await getRepoCommitsPage(owner, repoName, {
      perPage,
      page,
      accessToken,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Failed to fetch commits from GitHub", details: result.status ?? result.error },
        { status: result.status || 500 }
      );
    }

    let rawCommits = result.commits || [];
    if (author) {
      const lower = author.toLowerCase();
      rawCommits = rawCommits.filter((c) => {
        const login = c?.author?.login?.toLowerCase();
        const name = c?.commit?.author?.name?.toLowerCase();
        return login === lower || name === lower;
      });
    }

    const normalized = rawCommits
      .map((raw) => toCommitRecord(raw, repository.full_name))
      .filter(Boolean)
      .map((c) => ({
        ...c,
        shortSha: c.sha.slice(0, 7),
      }));

    return NextResponse.json(
      {
        commits: normalized,
        page,
        hasMore: (result.commits?.length ?? 0) === perPage,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[api/repositories/commits] error:", err);
    return NextResponse.json(
      { error: "Internal server error fetching commits" },
      { status: 500 }
    );
  }
}
