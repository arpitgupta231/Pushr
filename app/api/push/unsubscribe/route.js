import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function handle(request) {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;
  if (!githubUsername) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) return NextResponse.json({ error: "Endpoint is required" }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { github_username: githubUsername }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const result = await prisma.pushSubscription.deleteMany({ where: { endpoint, user_id: user.id } });
    return NextResponse.json({ ok: true, removed: result.count });
  } catch (error) {
    console.error("push unsubscribe failed", error);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
}

export async function POST(request) {
  return handle(request);
}

export async function DELETE(request) {
  return handle(request);
}
