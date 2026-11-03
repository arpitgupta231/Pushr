import GitHub from "next-auth/providers/github";
import { getUserData } from "@/lib/github";
import { prisma } from "@/lib/prisma";

export const authOptions = {
  providers: [
    GitHub({
      id: "github-oauth",
      name: "GitHub OAuth",
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      authorization: { params: { scope: "read:user user:email", allow_signup: "true" } }
    }),
    GitHub({
      id: "github-app",
      name: "GitHub App",
      clientId: process.env.GITHUB_APP_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: "read:user user:email", allow_signup: "true" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile, account, user }) {
      const githubUsername = profile?.login ?? user?.githubUsername ?? token.githubUsername ?? null;
      if (githubUsername) {
        token.githubUsername = githubUsername;
      }
      if (account?.provider === "github-oauth" && profile?.id) {
        token.githubId = String(profile.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.githubUsername = token.githubUsername ?? token.name ?? null;
      }
      return session;
    },
    async signIn({ profile, account }) {
      const username = profile?.login;
      if (!username) return false;
      try {
        const existing = await prisma.user.findUnique({
          where: { github_username: username },
        });

        // First sign-in syncs repos/stats; existing users only refresh the
        // OAuth token and backfill any repositories missing commit history.
        if (!existing) {
          // Persist the authenticated identity first. GitHub profile/API
          // enrichment is optional and must never block account creation.
          const userData = await getUserData(username, account?.provider === "github-app" ? account.access_token : null).catch(() => null);
          const email = userData?.email || profile?.email || null;
          const createData = {
              github_username: username,
              email,
              ...(account?.provider === "github-app" ? {
                github_access_token: account.access_token ?? null,
                github_refresh_token: account.refresh_token ?? null,
                github_token_expires_at: account.expires_at ? new Date(account.expires_at * 1000) : null,
                github_refresh_token_expires_at: account.refresh_token_expires_in ? new Date(Date.now() + account.refresh_token_expires_in * 1000) : null,
              } : {}),
              following_count: userData?.following ?? 0,
              starred_repo_count: 0,
              last_synced_at: new Date(),
          };
          let created;
          try {
            created = await prisma.user.create({ data: createData });
          } catch (error) {
            // A GitHub email may already be attached to another Pushr user.
            // Email is optional; username is the canonical unique identity.
            if (error?.code !== "P2002" || !email) throw error;
            created = await prisma.user.create({ data: { ...createData, email: null } });
          }

        } else {
          const isAppAuthorization = account?.provider === "github-app";
          if (isAppAuthorization && account?.access_token) {
            await prisma.user.update({
              where: { github_username: username },
              data: {
                github_access_token: account.access_token,
                github_refresh_token: account.refresh_token ?? existing.github_refresh_token,
                github_token_expires_at: account.expires_at ? new Date(account.expires_at * 1000) : null,
                github_refresh_token_expires_at: account.refresh_token_expires_in ? new Date(Date.now() + account.refresh_token_expires_in * 1000) : existing.github_refresh_token_expires_at,
              },
            });
          }

        }

        return true;
      } catch (e) {
        console.error("signIn failed:", e);
        return false;
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
};
