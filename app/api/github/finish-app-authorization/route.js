import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubAccessToken } from "@/lib/github-token";
import { syncUserGitHubData } from "@/lib/sync";
import { syncInitialRepositoryCommits } from "@/lib/commits";

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const username = session?.user?.githubUsername;
  if (!username) return NextResponse.redirect(new URL("/login", request.url));

  const user = await prisma.user.findUnique({ where: { github_username: username } });
  if (!user) return NextResponse.redirect(new URL("/login?error=user_missing", request.url));

  const accessToken = await getGitHubAccessToken(user.id).catch((error) => {
    console.error("[github/app-auth] token refresh failed", error);
    return null;
  });
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login?error=app_authorization_required", request.url));
  }

  try {
    const syncedUser = await syncUserGitHubData(user, accessToken);
    const history = await syncInitialRepositoryCommits(user, accessToken);
    if (!syncedUser) throw new Error("GitHub profile synchronization did not complete");
    if (syncedUser.repository_sync_error) throw new Error(syncedUser.repository_sync_error);
    console.info(`[github/app-auth] ${username}: synchronized ${syncedUser.repositories_synced} repositories; imported history for ${history.repositories} repositories (${history.commits} commits, ${history.failed} failures)`);
    if (syncedUser.repositories_synced === 0) console.warn(`[github/app-auth] ${username}: GitHub returned zero accessible repositories; check the App installation repository access and permissions`);
    if (history.failed > 0) console.error(`[github/app-auth] commit history import failed for ${history.failed} repositories`);
  } catch (error) {
    console.error(`[github/app-auth] initial sync failed for ${username}`, error);
    return NextResponse.redirect(new URL("/dashboard?githubSync=failed", request.url));
  }

  revalidatePath("/dashboard");
  return NextResponse.redirect(new URL("/dashboard?githubSync=complete", request.url));
}
