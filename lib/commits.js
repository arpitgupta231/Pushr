import { prisma } from "@/lib/prisma";
import { getRepoCommitsPage, toCommitRecord } from "@/lib/github";

const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 100;

function normalizeStoredCommits(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((commit) => commit && typeof commit.sha === "string" && commit.sha.length > 0);
}

// Merge commit records by SHA. Existing records win on duplicates so a later
// PushEvent timestamp never overwrites the exact timestamp from history.
export function mergeCommits(existing = [], incoming = []) {
    const bySha = new Map();
    for (const commit of [...existing, ...incoming]) {
        if (!commit?.sha || bySha.has(commit.sha)) continue;
        bySha.set(commit.sha, commit);
    }
    return [...bySha.values()].sort((a, b) => {
        const aTime = a.committed_at ? new Date(a.committed_at).getTime() : 0;
        const bTime = b.committed_at ? new Date(b.committed_at).getTime() : 0;
        return bTime - aTime;
    });
}

// Add newly detected commits to one repository without ever storing the same
// SHA twice. Returns the number of commits actually added.
export async function appendRepositoryCommits(repositoryId, incoming = []) {
    const newCommits = incoming.filter((commit) => commit?.sha);
    if (!repositoryId || newCommits.length === 0) return 0;

    const repository = await prisma.repository.findUnique({
        where: { id: repositoryId },
        select: { commits: true },
    });
    if (!repository) return 0;

    const existing = normalizeStoredCommits(repository.commits);
    const merged = mergeCommits(existing, newCommits);
    const added = merged.length - existing.length;
    if (added <= 0) return 0;

    await prisma.repository.update({
        where: { id: repositoryId },
        data: { commits: merged },
    });
    return added;
}

// One-time historical import for repositories whose commits field is still
// null. Called from sign-in only; the cron pipeline never calls this.
export async function syncInitialRepositoryCommits(user, accessToken = null) {
    const username = typeof user === "string" ? user : user?.github_username;
    const summary = { repositories: 0, commits: 0, failed: 0 };
    if (!username) return summary;

    const repositories = await prisma.repository.findMany({
        where: { user_id: username },
        select: { id: true, full_name: true, commits: true },
    });

    for (const repository of repositories) {
        if (repository.commits !== null) continue;

        const [owner, repoName] = (repository.full_name ?? "").split("/");
        if (!owner || !repoName) {
            summary.failed += 1;
            continue;
        }

        const collected = [];
        let failed = false;
        let complete = false;

        for (let page = 1; page <= MAX_HISTORY_PAGES; page += 1) {
            const result = await getRepoCommitsPage(owner, repoName, {
                perPage: HISTORY_PAGE_SIZE,
                page,
                accessToken,
            });

            if (!result.ok) {
                failed = true;
                console.error(
                    `[commits] history for ${repository.full_name} failed on page ${page}:`,
                    result.status ?? result.error
                );
                break;
            }

            if (result.commits.length === 0) {
                complete = true;
                break;
            }

            for (const rawCommit of result.commits) {
                const commit = toCommitRecord(rawCommit, repository.full_name);
                if (commit) collected.push(commit);
            }

            if (result.commits.length < HISTORY_PAGE_SIZE) {
                complete = true;
                break;
            }
        }

        if (failed) {
            summary.failed += 1;
            continue;
        }
        if (!complete) {
            summary.failed += 1;
            console.error(
                `[commits] history for ${repository.full_name} exceeded ${MAX_HISTORY_PAGES} pages; not writing partial history`
            );
            continue;
        }

        const commits = mergeCommits([], collected);
        try {
            await prisma.repository.update({
                where: { id: repository.id },
                data: { commits },
            });
            summary.repositories += 1;
            summary.commits += commits.length;
        } catch (error) {
            summary.failed += 1;
            console.error(`[commits] history write for ${repository.full_name} failed:`, error);
        }
    }

    return summary;
}

// Shape stored JSON commits for the dashboard's ContributionGraph. Stored
// commits are newest-first; the chart reads oldest -> newest.
export function toChartCommits(storedCommits) {
    return normalizeStoredCommits(storedCommits)
        .slice()
        .sort((a, b) => {
            const aTime = a.committed_at ? new Date(a.committed_at).getTime() : 0;
            const bTime = b.committed_at ? new Date(b.committed_at).getTime() : 0;
            return aTime - bTime;
        })
        .map((commit) => {
            const committedAt = commit.committed_at ? new Date(commit.committed_at) : null;
            const validDate = committedAt && !Number.isNaN(committedAt.getTime());
            return {
                sha: commit.sha.slice(0, 7),
                message: String(commit.message ?? "").split("\n")[0]?.slice(0, 80) || "commit",
                date: validDate ? committedAt.toISOString().slice(0, 10) : "",
                branch: "main",
            };
        });
}
