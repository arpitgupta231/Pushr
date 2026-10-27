import GitHub from "next-auth/providers/github";
import { getUserData } from "@/lib/github";
import { prisma } from "@/lib/prisma";
import { syncUserGitHubData } from "@/lib/sync";

export const authOptions = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: { params: { scope: "read:user user:email" } } 
    }),
  ],
  callbacks: {
    async jwt({ token, profile, account }) {
      if (account && profile) {
        token.githubUsername = profile.login;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.githubUsername) {
        session.user.githubUsername = token.githubUsername;
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

        // Only sync GitHub data during initial user setup on first sign-in
        if (!existing) {
          const userData = await getUserData(username, account?.access_token ?? null);
          if (!userData) return false;
          const email = userData.email || profile?.email || null;
          if (!email) return false;

          const created = await prisma.user.create({
            data: {
              github_username: username,
              email,
              github_access_token: account?.access_token ?? null,
              following_count: userData.following ?? 0,
              starred_repo_count: 0,
              last_synced_at: new Date(),
            },
          });

          try {
            await syncUserGitHubData(created, account?.access_token ?? null);
          } catch (e) {
            console.error("Initial user setup sync failed (non-blocking):", e);
          }
        } else if (account?.access_token) {
          await prisma.user.update({
            where: { github_username: username },
            data: { github_access_token: account.access_token },
          });
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