import { getUserRepos } from "@/lib/github";
import { prisma } from "@/lib/prisma";

// Single owner of Repository-row writes: every create, update, and lookup of
// repository records happens through this module. lib/activity.js only ever
// resolves rows here (never creates), and the sync pipeline routes every
// write through the same upsert — so no other code path can mint partial or
// incomplete repository records.

// Look up one synced repository by its GitHub repo id. Resolve-only — never
// creates. Returns the database id, or null when unknown/invalid.
export async function findRepositoryId(githubRepoId) {
    if (!Number.isInteger(githubRepoId) || githubRepoId <= 0) return null;
    const row = await prisma.repository.findUnique({
        where: { github_repo_id: githubRepoId },
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
        language: rawRepo.language ?? null,
        is_fork: rawRepo.fork ?? false,
        github_url: rawRepo.html_url ?? `https://github.com/${fullName ?? ""}`,
        github_created_at: createdAt,
    };

    try {
        return await prisma.repository.upsert({
            where: { github_repo_id: githubRepoId },
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
                .findUnique({ where: { github_repo_id: githubRepoId } })
                .catch(() => null);
            return row;
        }
        console.error(`[repos] upsert repository ${githubRepoId} failed:`, e?.message ?? e);
        return null;
    }
}

// Sync the GitHub repos owned by `username` into the Repository table.
// Every owned repo is passed through upsertRepository, so missing repos are
// created and existing (or historically partial) rows are refreshed with
// complete GitHub data in the same pass. Returns the number of rows written;
// 0 on any failure.
export async function syncUserRepositories(username) {
    try {
        const repos = await getUserRepos(username);
        if (!Array.isArray(repos) || repos.length === 0) return 0;

        let synced = 0;
        for (const repo of repos) {
            const written = await upsertRepository(repo, username);
            if (written) synced += 1;
        }
        return synced;
    } catch (e) {
        console.error(`[repos] sync repositories for ${username} failed:`, e);
        return 0;
    }
}
