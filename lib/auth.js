import GitHub from "next-auth/providers/github";
import { getUserData } from "@/lib/github";
import { prisma } from "@/lib/prisma";
import {getReposForUser} from "@/lib/repos";

export const authOptions = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: { params: { scope: "read:user user:email" } } 
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const username = profile?.login;
      if (!username) return false;
      try {
        const existing = await prisma.user.findUnique({
          where: { github_username: username },
        });

        if (!existing) {
          const userData = await getUserData(username);
          if (!userData) return false;
          const email = userData.email || profile?.email || null;
          if (!email) return false;

          await prisma.user.create({
            data: {
              github_username: username,
              email,
              following_count: userData.following ?? 0,
              starred_repo_count: 0,
            },
          });
        }

        try {
          await getReposForUser(username); // Fetch and store user's repositories
        } catch (e) {
          console.error("Repo sync failed (non-blocking):", e);
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