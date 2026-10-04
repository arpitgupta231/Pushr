import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserEvents, toActivityRow } from "@/lib/github";

// GET /api/cron/activities[?username=<login>]
// V1 activity sync: polls the GitHub Events API per Pushr user and stores new
// rows. This is what captures the RIVAL's activity — webhooks are repo-scoped
// and can never deliver another account's events, and nothing auto-registers
// hooks on anyone's repos.
//
// Protection: if CRON_SECRET is set, callers must send
// `Authorization: Bearer <secret>` (Vercel Cron does this automatically).
// Without it the route is open — fine for local dev, set the secret in prod.
//
// Scheduling (not wired here — depends on hosting): Vercel Cron via
// vercel.json (`{ "crons": [{ "path": "/api/cron/activities", "schedule": "*/15 * * * *" }] }`)
// or any external pinger (cron-job.org) hitting this URL. Users are synced
// sequentially to stay gentle on the 60/hr unauthenticated REST quota — add
// a GITHUB_TOKEN PAT (no scopes needed for public events) to raise it.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const only = searchParams.get("username")?.trim() || null;

  const users = await prisma.user.findMany({
    ...(only ? { where: { github_username: only } } : {}),
    select: { id: true, github_username: true },
  });

  const results = [];
  for (const user of users) {
    results.push(await syncUser(user));
  }
  return NextResponse.json({ ok: true, users: results });
}

async function syncUser(user) {
  const summary = {
    username: user.github_username,
    fetched: 0,
    stored: 0,
    duplicates: 0,
    unsupported: 0,
  };
  let events;
  try {
    events = await getUserEvents(user.github_username, 30);
  } catch {
    summary.error = "fetch failed";
    return summary;
  }
  summary.fetched = events.length;

  for (const event of events) {
    const row = toActivityRow(event);
    if (!row) {
      summary.unsupported += 1;
      continue;
    }
    const repository_id = await resolveRepositoryId(row, user.github_username).catch(() => null);
    try {
      await prisma.activity.create({
        data: {
          ...row,
          user_id: user.id,
          repository_id,
          // Scoring is not finalized — keep neutral (see AGENTS.md).
          points_awarded: 0,
        },
      });
      summary.stored += 1;
    } catch (e) {
      if (e?.code === "P2002") summary.duplicates += 1;
      else summary.errors = (summary.errors ?? 0) + 1;
    }
  }
  return summary;
}

// Link the activity to its repository, auto-creating the row from the event
// when it was never synced. Mirrors the webhook receiver: creation only
// happens when the repo owner is in our DB — otherwise repository_id is null
// (the FK on user requires an existing github_username).
async function resolveRepositoryId(row, username) {
  const repo = row.metadata?.repo ?? {};
  const githubId = Number(repo.id);
  if (!Number.isInteger(githubId)) return null;

  const existing = await prisma.repository.findUnique({
    where: { github_repo_id: githubId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const fullName = repo.name ?? null; // "owner/name"
  const ownerLogin = fullName?.split("/")[0] ?? null;
  for (const login of [ownerLogin, username]) {
    if (!login) continue;
    const ownerRow = await prisma.user.findUnique({
      where: { github_username: login },
      select: { github_username: true },
    });
    if (!ownerRow) continue;
    const shortName = fullName?.split("/")[1] ?? "unknown";
    try {
      const created = await prisma.repository.create({
        data: {
          github_repo_id: githubId,
          user_id: ownerRow.github_username,
          name: shortName,
          full_name: fullName ?? `${ownerRow.github_username}/${shortName}`,
          github_url: toHtmlUrl(repo.url) ?? `https://github.com/${fullName ?? ""}`,
          github_created_at: new Date(),
        },
        select: { id: true },
      });
      return created.id;
    } catch (e) {
      // Raced with another sync — re-read the winner.
      if (e?.code === "P2002") {
        const reread = await prisma.repository.findUnique({
          where: { github_repo_id: githubId },
          select: { id: true },
        });
        return reread?.id ?? null;
      }
      return null;
    }
  }
  return null;
}

// Events API gives api.github.com/repos URLs; store the human URL instead.
function toHtmlUrl(apiUrl) {
  if (typeof apiUrl !== "string") return null;
  if (!apiUrl.startsWith("https://api.github.com/repos/")) return null;
  return apiUrl.replace("https://api.github.com/repos/", "https://github.com/");
}
