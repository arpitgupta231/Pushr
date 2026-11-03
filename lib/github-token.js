import { prisma } from "@/lib/prisma";

// Tokens and refresh credentials stay in PostgreSQL and are only returned to
// server modules. GitHub App OAuth user tokens expire; refresh before use.
export async function getGitHubAccessToken(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { github_access_token: true, github_refresh_token: true, github_token_expires_at: true },
  });
  if (!user) return null;
  if (!user.github_token_expires_at || user.github_token_expires_at.getTime() > Date.now() + 60_000) {
    return user.github_access_token;
  }
  if (!user.github_refresh_token) return user.github_access_token;

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_APP_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_APP_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.github_refresh_token,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub token refresh failed (${response.status})`);
  const refreshed = await response.json();
  if (!refreshed.access_token) throw new Error("GitHub token refresh response had no access token");
  await prisma.user.update({
    where: { id: userId },
    data: {
      github_access_token: refreshed.access_token,
      github_refresh_token: refreshed.refresh_token ?? user.github_refresh_token,
      github_token_expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 0) * 1000),
      ...(refreshed.refresh_token_expires_in ? { github_refresh_token_expires_at: new Date(Date.now() + Number(refreshed.refresh_token_expires_in) * 1000) } : {}),
    },
  });
  return refreshed.access_token;
}
