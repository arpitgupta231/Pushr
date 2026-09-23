import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Send a rivalry request. The sender becomes user1 (requester convention).
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const opponentLogin = body?.opponentUsername?.trim() || null;
  if (!opponentLogin) {
    return NextResponse.json(
      { error: "opponentUsername is required." },
      { status: 400 }
    );
  }
  if (opponentLogin === githubUsername) {
    return NextResponse.json(
      { error: "You cannot challenge yourself." },
      { status: 400 }
    );
  }

  const [dbUser, opponent] = await Promise.all([
    prisma.user.findUnique({ where: { github_username: githubUsername } }),
    prisma.user.findUnique({ where: { github_username: opponentLogin } }),
  ]);

  if (!dbUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (!opponent) {
    return NextResponse.json(
      { error: `${opponentLogin} is not on Pushr yet.` },
      { status: 404 }
    );
  }

  const ids = [dbUser.id, opponent.id];

  // One active rivalry per user — either side locked blocks the challenge.
  const active = await prisma.rivalry.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ user1_id: { in: ids } }, { user2_id: { in: ids } }],
    },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json(
      { error: "One of you is already in an active rivalry." },
      { status: 409 }
    );
  }

  // No duplicate pending request between this pair, either direction.
  const existing = await prisma.rivalry.findFirst({
    where: {
      status: "PENDING",
      OR: [
        { user1_id: dbUser.id, user2_id: opponent.id },
        { user1_id: opponent.id, user2_id: dbUser.id },
      ],
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A request between you already exists." },
      { status: 409 }
    );
  }

  const created = await prisma.rivalry.create({
    data: { user1_id: dbUser.id, user2_id: opponent.id },
    select: { id: true, status: true, created_at: true },
  });

  return NextResponse.json(
    {
      rivalry: {
        id: created.id,
        status: created.status,
        toUsername: opponentLogin,
        created_at: created.created_at.toISOString(),
      },
    },
    { status: 201 }
  );
}
