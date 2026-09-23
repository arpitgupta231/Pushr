import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// accept | decline (recipient only) or cancel (requester only).
// Accept locks the 6-month rivalry: started_at = now, ends_at = +6 months.
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
  const rivalryId = body?.rivalryId || null;
  const action = body?.action || null;
  if (!rivalryId || !["accept", "decline", "cancel"].includes(action)) {
    return NextResponse.json(
      { error: "rivalryId and action (accept|decline|cancel) are required." },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { github_username: githubUsername },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const rivalry = await prisma.rivalry.findUnique({
    where: { id: rivalryId },
    include: {
      user1: { select: { github_username: true } },
      user2: { select: { github_username: true } },
    },
  });
  if (!rivalry || rivalry.status !== "PENDING") {
    return NextResponse.json(
      { error: "Request not found or no longer pending." },
      { status: 404 }
    );
  }

  const isRequester = rivalry.user1_id === dbUser.id;
  const isRecipient = rivalry.user2_id === dbUser.id;
  if (!isRequester && !isRecipient) {
    return NextResponse.json({ error: "Not your request." }, { status: 403 });
  }

  // Cancelling your own outgoing request just deletes the pending row.
  if (action === "cancel") {
    if (!isRequester) {
      return NextResponse.json(
        { error: "Only the requester can cancel." },
        { status: 403 }
      );
    }
    await prisma.rivalry.delete({ where: { id: rivalry.id } });
    return NextResponse.json({ ok: true, action: "cancelled" });
  }

  // Accept / decline are recipient-only.
  if (!isRecipient) {
    return NextResponse.json(
      { error: "Only the recipient can respond." },
      { status: 403 }
    );
  }

  if (action === "decline") {
    await prisma.rivalry.delete({ where: { id: rivalry.id } });
    return NextResponse.json({ ok: true, action: "declined" });
  }

  // Accept: re-check the one-active-rivalry rule inside a transaction,
  // then lock in the 6-month match.
  const result = await prisma.$transaction(async (tx) => {
    const ids = [rivalry.user1_id, rivalry.user2_id];
    const active = await tx.rivalry.findFirst({
      where: {
        status: "ACTIVE",
        OR: [{ user1_id: { in: ids } }, { user2_id: { in: ids } }],
      },
      select: { id: true },
    });
    if (active) return null;
    const startedAt = new Date();
    const endsAt = new Date(startedAt);
    endsAt.setMonth(endsAt.getMonth() + 6);
    return tx.rivalry.update({
      where: { id: rivalry.id },
      data: { status: "ACTIVE", started_at: startedAt, ends_at: endsAt },
      select: {
        id: true,
        status: true,
        started_at: true,
        ends_at: true,
      },
    });
  });

  if (!result) {
    return NextResponse.json(
      { error: "One of you is already in an active rivalry." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    action: "accepted",
    rivalry: {
      id: result.id,
      status: result.status,
      user1_username: rivalry.user1.github_username,
      user2_username: rivalry.user2.github_username,
      started_at: result.started_at?.toISOString() ?? null,
      ends_at: result.ends_at?.toISOString() ?? null,
    },
  });
}
