import { getUserRepos, getUserContributedRepos } from "@/lib/github";
import { toChartCommits } from "@/lib/commits";
import { prisma } from "@/lib/prisma";

const REPOSITORY_LIST_SELECT = {
    name: true,
    full_name: true,
    description: true,
    language: true,
    is_fork: true,
    is_contributor: true,
    github_url: true,
    github_created_at: true,
    archived: true,
    default_branch: true,
    private: true,
    pushed_at: true,
    commits: true,
};

export function toRepositoryView(repo) {
    return {
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        isFork: repo.is_fork,
        isContributor: repo.is_contributor,
        githubUrl: repo.github_url,
        private: repo.private,
        archived: repo.archived,
        defaultBranch: repo.default_branch,
        pushedAt: repo.pushed_at?.toISOString() ?? null,
        commits: toChartCommits(repo.commits),
    };
}

export async function listUserRepositories(username) {
    if (typeof username !== "string" || username.length === 0) return [];
    const repositories = await prisma.repository.findMany({
        where: { user_id: username },
        orderBy: [{ pushed_at: "desc" }, { github_created_at: "desc" }],
        select: REPOSITORY_LIST_SELECT,
    });
    return repositories.map(toRepositoryView);
}

// Single owner of Repository-row writes: every create, update, and lookup of
// repository records happens through this module. lib/activity.js only ever
// resolves rows here (never creates), and the sync pipeline routes every
// write through the same upsert — so no other code path can mint partial or
// incomplete repository records.

// Look up one synced repository by its GitHub repo id. Resolve-only — never
// creates. Returns the database id, or null when unknown/invalid.
export async function findRepositoryId(githubRepoId, username = null) {
    if (!Number.isInteger(githubRepoId) || githubRepoId <= 0) return null;
    const row = await prisma.repository.findFirst({
        where: { github_repo_id: githubRepoId, ...(username ? { user_id: username } : {}) },
        select: { id: true },
    });
    return row?.id ?? null;
}

// Create-or-update one Repository row from full GitHub repo data —
// GET /users/{u}/repos entries (id, name, full_name, description, private,
// language, fork, created_at, html_url). The owner must be an existing Pushr
// user: Repository.user_id is an FK to User.github_username — otherwise
// null. Updating an existing row (e.g. a stale or partial record from older
// code) refreshes it with the same canonical data. Returns the row or null.
// Never throws.
export async function upsertRepository(rawRepo, ownerLogin) {
    const githubRepoId = Number(rawRepo?.id);
    if (!Number.isInteger(githubRepoId) || githubRepoId <= 0) return null;
    if (typeof ownerLogin !== "string" || ownerLogin.length === 0) return null;

    const ownerRow = await prisma.user.findUnique({
        where: { github_username: ownerLogin },
        select: { github_username: true },
    });
    if (!ownerRow) return null;

    const fullName = rawRepo.full_name ?? null; // e.g. "owner/repo"
    const shortName = rawRepo.name ?? fullName?.split("/")[1] ?? "unknown";
    const createdAt = rawRepo.created_at ? new Date(rawRepo.created_at) : new Date();
    const data = {
        user_id: ownerRow.github_username,
        name: shortName,
        full_name: fullName ?? `${ownerRow.github_username}/${shortName}`,
        description: rawRepo.description ?? null,
        private: rawRepo.private ?? false,
        archived: rawRepo.archived ?? false,
        default_branch: rawRepo.default_branch ?? null,
        pushed_at: rawRepo.pushed_at ? new Date(rawRepo.pushed_at) : null,
        language: rawRepo.language ?? null,
        is_fork: rawRepo.fork ?? false,
        ...(typeof rawRepo._is_contributor === "boolean" ? { is_contributor: rawRepo._is_contributor } : {}),
        github_url: rawRepo.html_url ?? `https://github.com/${fullName ?? ""}`,
        github_created_at: createdAt,
    };

    try {
        return await prisma.repository.upsert({
            where: { github_repo_id_user_id: { github_repo_id: githubRepoId, user_id: ownerRow.github_username } },
            create: {
                github_repo_id: githubRepoId,
                ...data,
            },
            update: data,
        });
    } catch (e) {
        // Raced with a concurrent writer — re-read the winner.
        if (e?.code === "P2002") {
            const row = await prisma.repository
                .findFirst({ where: { github_repo_id: githubRepoId, user_id: ownerRow.github_username } })
                .catch(() => null);
            return row;
        }
        console.error(`[repos] upsert repository ${githubRepoId} failed:`, e?.message ?? e);
        return null;
    }
}

// Sync repositories accessible to the authorized user into the Repository table.
// Repositories are associated with the Pushr user who granted access, even
// when their canonical GitHub owner is an organization/collaborator.
// Every accessible repo is passed through upsertRepository, so missing repos are
// created and existing (or historically partial) rows are refreshed with
// complete GitHub data in the same pass. Returns the number of rows written;
// 0 on any failure.
export async function syncUserRepositories(username, accessToken = null) {
    const [accessibleRepos, contributedRepos] = await Promise.all([
        getUserRepos(username, accessToken),
        getUserContributedRepos(username, accessToken).catch((error) => {
            console.error(`[repos] contributed repository lookup failed for ${username}:`, error?.message ?? error);
            return [];
        }),
    ]);
    if (!Array.isArray(accessibleRepos)) throw new Error("GitHub returned an invalid repository list");
    const combined = new Map();
    for (const repo of accessibleRepos) combined.set(Number(repo.id), repo);
    for (const repo of contributedRepos) combined.set(Number(repo.id), { ...combined.get(Number(repo.id)), ...repo, _is_contributor: true });

    let synced = 0;
    for (const repo of combined.values()) {
        const written = await upsertRepository(repo, username);
        if (!written) throw new Error(`Failed to store repository ${repo.full_name ?? repo.id}`);
        synced += 1;
    }
    return synced;
}
