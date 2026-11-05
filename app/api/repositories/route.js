import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listUserRepositories } from "@/lib/repos";

export async function GET() {
  const session = await getServerSession(authOptions);
  const githubUsername = session?.user?.githubUsername?.trim() || null;

  if (!githubUsername) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repositories = await listUserRepositories(githubUsername);
    return NextResponse.json(
      { repositories },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[api/repositories] failed:", error?.message ?? error);
    return NextResponse.json({ error: "Failed to load repositories" }, { status: 500 });
  }
}
