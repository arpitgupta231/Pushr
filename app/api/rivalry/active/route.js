import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns the session user's ACTIVE rivalry, or { rivalry: null }.
export async function GET() {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    return NextResponse.json({ rivalry: null }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { github_username: githubUsername },
  });

  if (!dbUser) {
    return NextResponse.json({ rivalry: null }, { status: 404 });
  }

  const rivalry = await prisma.rivalry.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ user1_id: dbUser.id }, { user2_id: dbUser.id }],
    },
    include: {
      user1: { select: { github_username: true } },
      user2: { select: { github_username: true } },
    },
  });

  if (!rivalry) {
    return NextResponse.json({ rivalry: null });
  }

  return NextResponse.json({
    rivalry: {
      id: rivalry.id,
      status: rivalry.status,
      user1_score: rivalry.user1_score,
      user2_score: rivalry.user2_score,
      rivalry_score: rivalry.rivalry_score,
      ends_at: rivalry.ends_at?.toISOString() ?? null,
      user1_username: rivalry.user1.github_username,
      user2_username: rivalry.user2.github_username,
    },
  });
}
