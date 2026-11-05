import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseSubscription(body) {
  const sub = body?.subscription ?? body;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint.trim() : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh.trim() : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth.trim() : "";
  const userAgent = typeof body?.userAgent === "string" ? body.userAgent.trim() : null;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth, user_agent: userAgent || null };
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;
  if (!githubUsername) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = parseSubscription(body);
  if (!parsed) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { github_username: githubUsername }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.endpoint },
      create: { user_id: user.id, ...parsed },
      update: { user_id: user.id, p256dh: parsed.p256dh, auth: parsed.auth, user_agent: parsed.user_agent },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("push subscribe failed", error);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}
