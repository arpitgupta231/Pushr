import { getUserRepos } from "@/lib/github";
import { prisma } from "@/lib/prisma";

export async function getReposForUser(username) {
    try {
        const repos = await getUserRepos(username);
        let synced = 0;
        for (const repo of repos) {
            const existing = await prisma.repository.findUnique({
                where: { github_repo_id: repo.id },
            });
            if (existing) continue;
            await prisma.repository.create({
                data: {
                    github_repo_id: repo.id,
                    user_id: username,
                    name: repo.name,
                    full_name: repo.full_name,
                    description: repo.description,
                    private: repo.private,
                    language: repo.language,
                    is_fork: repo.fork,
                    github_created_at: new Date(repo.created_at),
                    github_url: repo.html_url,
                }
            });
            synced += 1;
        }
        return synced;
    } catch (e) {
        console.error("Error fetching repos for user:", e);
        return 0;
    }
}
