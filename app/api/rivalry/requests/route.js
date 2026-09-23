import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserFollowing } from "@/lib/github";

const SUGGESTION_LIMIT = 5;

// Request direction convention: user1 = requester, user2 = recipient.
// So PENDING rows where I'm user2 are incoming, where I'm user1 outgoing.
export async function GET() {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    return NextResponse.json(
      { incoming: [], outgoing: [], suggestions: [] },
      { status: 401 }
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { github_username: githubUsername },
  });

  if (!dbUser) {
    return NextResponse.json(
      { incoming: [], outgoing: [], suggestions: [] },
      { status: 404 }
    );
  }

  const pending = await prisma.rivalry.findMany({
    where: {
      status: "PENDING",
      OR: [{ user1_id: dbUser.id }, { user2_id: dbUser.id }],
    },
    include: {
      user1: { select: { github_username: true } },
      user2: { select: { github_username: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const incoming = pending
    .filter((r) => r.user2_id === dbUser.id)
    .map((r) => ({
      id: r.id,
      fromUsername: r.user1.github_username,
      created_at: r.created_at.toISOString(),
    }));

  const outgoing = pending
    .filter((r) => r.user1_id === dbUser.id)
    .map((r) => ({
      id: r.id,
      toUsername: r.user2.github_username,
      created_at: r.created_at.toISOString(),
    }));

  // Users I'm already in a pending exchange with — never suggest them.
  const pendingIds = new Set(
    pending.flatMap((r) => [r.user1_id, r.user2_id])
  );

  // Users locked in an ACTIVE rivalry can't be challenged.
  const activeRows = await prisma.rivalry.findMany({
    where: { status: "ACTIVE" },
    select: { user1_id: true, user2_id: true },
  });
  const lockedIds = new Set(
    activeRows.flatMap((r) => [r.user1_id, r.user2_id])
  );

  // Map friend logins to Pushr users (challenge needs a DB row for the FK).
  const friendLogins = (dbUser.friends || []).filter(Boolean);
  const pushrFriends =
    friendLogins.length > 0
      ? await prisma.user.findMany({
          where: { github_username: { in: friendLogins } },
          select: { id: true, github_username: true },
        })
      : [];
  const pushrByLogin = new Map(
    pushrFriends.map((u) => [u.github_username, u])
  );

  // Avatars: one batched following fetch, matched by login.
  // Failure leaves avatars null — never empties the suggestions.
  let avatarByLogin = new Map();
  try {
    const { users, ok } = await getUserFollowing(githubUsername);
    if (ok) {
      avatarByLogin = new Map(
        users.map((u) => [u.login, u.avatar_url ?? null])
      );
    }
  } catch {
    // avatars stay null
  }

  const suggestions = [];
  for (const login of friendLogins) {
    if (!login || login === githubUsername) continue;
    if (suggestions.length >= SUGGESTION_LIMIT) break;
    const pushrUser = pushrByLogin.get(login);
    if (
      pushrUser &&
      (pendingIds.has(pushrUser.id) || lockedIds.has(pushrUser.id))
    ) {
      continue;
    }
    suggestions.push({
      login,
      avatar_url: avatarByLogin.get(login) ?? null,
      onPushr: !!pushrUser,
    });
  }

  return NextResponse.json({ incoming, outgoing, suggestions });
}
