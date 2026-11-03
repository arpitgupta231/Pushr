import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Set this URL as the GitHub App Setup URL. GitHub redirects here after the
// user installs or configures the App; NextAuth then performs App user auth.
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.githubUsername) return NextResponse.redirect(new URL("/login", request.url));
  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get("installation_id");
  if (!installationId || !/^\d+$/.test(installationId)) {
    return NextResponse.json({ error: "Missing installation_id" }, { status: 400 });
  }
  const origin = process.env.NEXTAUTH_URL || new URL(request.url).origin;
  return NextResponse.redirect(new URL("/login?authorize=app", origin));
}
