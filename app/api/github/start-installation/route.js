import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.githubUsername) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  if (!slug) {
    return NextResponse.json({ error: "GitHub App slug is not configured" }, { status: 500 });
  }
  return NextResponse.redirect(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
}
