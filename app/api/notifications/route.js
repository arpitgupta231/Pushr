import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.githubUsername) return null;
  const user = await prisma.user.findUnique({ where: { github_username: session.user.githubUsername }, select: { id: true } });
  return user?.id ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const notifications = await prisma.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: 50,
    select: { id: true, title: true, body: true, href: true, read_at: true, created_at: true },
  });
  return NextResponse.json({ notifications });
}

export async function PATCH(request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string") return NextResponse.json({ error: "Notification id is required" }, { status: 400 });
  const result = await prisma.notification.updateMany({ where: { id, user_id: userId, read_at: null }, data: { read_at: new Date() } });
  return NextResponse.json({ updated: result.count === 1 });
}
