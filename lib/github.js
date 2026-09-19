import { prisma } from "@/lib/prisma";

const github_api = "https://api.github.com";

export async function getUserData(username) {
    const response = await fetch(`${github_api}/users/${username}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch user data for ${username}`);
    }
    const data = await response.json();
    return data;
}

export async function getUserRepos(username) {
    const response = await fetch(`${github_api}/users/${username}/repos?type=owner&per_page=100`);
    if (!response.ok) {
        throw new Error(`Failed to fetch user repos for ${username}`);
    }
    return response.json();
}

// Fetch one page of a follow-list endpoint (following / followers).
// Never throws. ok=false when the request failed (rate limit, network…).
async function getFollowPage(url, headers) {
    try {
        const response = await fetch(url, { headers, next: { revalidate: 300 } });
        if (!response.ok) return { users: [], nextUrl: null, ok: false };
        const data = await response.json();
        // Follow the RFC 5988 Link header for pagination: <url>; rel="next".
        const link = response.headers.get("link") || "";
        const next = link.split(",").find((p) => p.includes('rel="next"'));
        const nextUrl = next ? next.slice(next.indexOf("<") + 1, next.indexOf(">")) : null;
        return { users: Array.isArray(data) ? data : [], nextUrl, ok: true };
    } catch {
        return { users: [], nextUrl: null, ok: false };
    }
}

// Fetch the full follow list (following or followers), page by page.
// maxPages caps API burn for users with huge lists. Shaped to
// { users: [{ id, login, avatar_url }], ok }. ok=false when any page
// failed — callers must NOT treat that as "empty list". Never throws.
async function getFollowList(username, kind, perPage = 100, maxPages = 5, accessToken = null) {
    if (!username || (kind !== "following" && kind !== "followers")) {
        return { users: [], ok: false };
    }
    const headers = { ...githubHeaders() };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const out = [];
    let url = `${github_api}/users/${username}/${kind}?per_page=${perPage}`;
    for (let page = 0; page < maxPages && url; page++) {
        const { users, nextUrl, ok } = await getFollowPage(url, headers);
        if (!ok) return { users: [], ok: false };
        for (const u of users) {
            if (typeof u?.id !== "number") continue;
            out.push({ id: u.id, login: u.login ?? null, avatar_url: u.avatar_url ?? null });
        }
        url = nextUrl;
    }
    return { users: out, ok: true };
}

export async function getUserFollowing(username, perPage = 100, maxPages = 5, accessToken = null) {
    return getFollowList(username, "following", perPage, maxPages, accessToken);
}

export async function getUserFollowers(username, perPage = 100, maxPages = 5, accessToken = null) {
    return getFollowList(username, "followers", perPage, maxPages, accessToken);
}

// Mutual follows = friends: fetch GET /users/{u}/followers and
// GET /users/{u}/following, keep the logins present in both lists
// (one batched fetch each, not N per-user follow checks). Returns
// [{ id, login, avatar_url }], or null when either fetch failed
// (rate limit, network…) — null MUST skip DB writes so a failure
// never wipes good data. Empty array = genuinely no mutuals.
export async function getMutualFollows(username, perPage = 100, maxPages = 5, accessToken = null) {
    if (!username) return null;
    const [following, followers] = await Promise.all([
        getUserFollowing(username, perPage, maxPages, accessToken),
        getUserFollowers(username, perPage, maxPages, accessToken),
    ]);
    if (!following.ok || !followers.ok) return null;
    const followerLogins = new Set(followers.users.map((f) => f.login).filter(Boolean));
    return following.users.filter((f) => f.login && followerLogins.has(f.login));
}

// Fetch mutual follows AND persist them: rewrites User.friends with the
// response logins, then returns the same response
// ([{ id, login, avatar_url }]) for callers to render. Returns null when
// the user isn't in the DB or either fetch failed — and in those cases
// the stored array is left untouched, so a failure never wipes good data.
// Empty array = genuinely no mutuals (stored as such). Never throws.
export async function syncUserFriends(username, perPage = 100, maxPages = 5, accessToken = null) {
    if (!username) return null;
    try {
        const user = await prisma.user.findUnique({
            where: { github_username: username },
            select: { id: true },
        });
        if (!user) return null;
        const mutuals = await getMutualFollows(username, perPage, maxPages, accessToken);
        if (mutuals === null) return null;
        await prisma.user.update({
            where: { id: user.id },
            data: { friends: mutuals.map((m) => m.login) },
        });
        return mutuals;
    } catch (e) {
        console.error("syncUserFriends failed:", e);
        return null;
    }
}

function githubHeaders() {
    const headers = { Accept: "application/vnd.github.v3+json" };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

export async function getRepoCommits(owner, repoName, perPage = 30) {
    try {
        const response = await fetch(
            `${github_api}/repos/${owner}/${repoName}/commits?per_page=${perPage}`,
            { headers: githubHeaders(), next: { revalidate: 300 } }
        );
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

export async function getRepoContributors(owner, repoName) {
    try {
        const response = await fetch(
            `${github_api}/repos/${owner}/${repoName}/contributors?per_page=10`
        );
        if (!response.ok) return [];
        return response.json();
    } catch {
        return [];
    }
}

// Poll the GitHub Events API for a user's public activity.
// (GitHub has no pull-based "webhook API" — webhooks are pushed to you;
// polling this endpoint is the V1 approach.) Prefers the per-user OAuth
// token, falls back to GITHUB_TOKEN. Never throws — returns [] on failure.
// Note: GitHub only keeps ~90 days / ~300 events visible here.
export async function getUserEvents(username, perPage = 30, accessToken = null) {
    if (!username) return [];
    try {
        const headers = { ...githubHeaders() };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const response = await fetch(
            `${github_api}/users/${username}/events?per_page=${perPage}`,
            // Sync path, not a render path — never serve a cached copy.
            { headers, cache: "no-store" }
        );
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

// Map a raw GitHub event to an `activities` table row (without user_id /
// repository_id, which the sync step resolves). Returns null for event
// types outside the MVP ActivityType enum — those are skipped, not stored.
export function toActivityRow(event) {
    if (!event?.id || !event?.type || !event?.created_at) return null;
    const payload = event.payload || {};
    const repo = event.repo || {};
    const metadata = {
        githubType: event.type,
        actor: event.actor?.login ?? null,
        repo: { id: repo.id ?? null, name: repo.name ?? null, url: repo.url ?? null },
    };
    let type = null;
    switch (event.type) {
        case "PushEvent":
            type = "PUSH";
            metadata.ref = payload.ref ?? null;
            metadata.head = payload.head ?? null;
            metadata.commitCount = payload.size ?? payload.commits?.length ?? 0;
            metadata.commits = (payload.commits || []).slice(0, 10).map((c) => ({
                sha: c.sha?.slice(0, 7) ?? null,
                message: c.message?.split("\n")[0]?.slice(0, 120) ?? null,
                author: c.author?.name ?? c.author?.email ?? null,
            }));
            break;
        case "WatchEvent":
            // Starring a repo surfaces as WatchEvent with action "started".
            if (payload.action !== "started") return null;
            type = "STAR";
            metadata.action = payload.action;
            break;
        case "ForkEvent":
            type = "FORK";
            metadata.forkee = payload.forkee?.full_name ?? null;
            metadata.forkeeUrl = payload.forkee?.html_url ?? null;
            break;
        case "CreateEvent":
            // Only repo creation maps to the enum; branch/tag creations are skipped.
            if (payload.ref_type !== "repository") return null;
            type = "CREATE_REPO";
            metadata.refType = payload.ref_type;
            metadata.description = payload.description ?? null;
            break;
        case "PullRequestEvent": {
            const pr = payload.pull_request || {};
            const merged = pr.merged === true;
            type = merged ? "MERGE" : "PR";
            metadata.action = payload.action ?? null;
            metadata.number = payload.number ?? null;
            metadata.title = pr.title ?? null;
            metadata.merged = merged;
            metadata.url = pr.html_url ?? null;
            break;
        }
        case "IssuesEvent": {
            const issue = payload.issue || {};
            type = "ISSUE";
            metadata.action = payload.action ?? null;
            metadata.number = issue.number ?? null;
            metadata.title = issue.title ?? null;
            metadata.url = issue.html_url ?? null;
            break;
        }
        default:
            return null;
    }
    return {
        type,
        github_event_id: String(event.id),
        metadata,
        created_at: new Date(event.created_at),
    };
}

const github_graphql = "https://api.github.com/graphql";

const CONTRIBUTION_CALENDAR_QUERY = `
  query($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
              weekday
            }
          }
        }
      }
    }
  }
`;

// Fetch a user's GitHub contribution calendar via the GraphQL API.
// Prefers the per-user OAuth access token from NextAuth (sees the viewer's
// own private contributions); falls back to the server GITHUB_TOKEN PAT for
// public data. Never throws — returns empty data so the dashboard still renders.
// `from`/`to` are ISO datetimes; pass a full-year range and slice quarters client-side.
export async function getUserContributionDays(username, from, to, accessToken) {
    const fallback = { days: [], total: 0 };
    if (!username) return fallback;
    const token = accessToken || process.env.GITHUB_TOKEN;
    if (!token) return fallback;
    try {
        const response = await fetch(github_graphql, {
            method: "POST",
            headers: {
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                query: CONTRIBUTION_CALENDAR_QUERY,
                variables: { login: username, from, to },
            }),
            next: { revalidate: 300 },
        });
        if (!response.ok) return fallback;
        const json = await response.json();
        const calendar = json?.data?.user?.contributionsCollection?.contributionCalendar;
        if (!calendar) return fallback;
        const days = (calendar.weeks || [])
            .flatMap((w) => w?.contributionDays || [])
            .filter((d) => d?.date)
            .map((d) => ({
                date: d.date,
                count: d.contributionCount ?? 0,
                color: d.color ?? null,
            }))
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        return { days, total: calendar.totalContributions ?? 0 };
    } catch {
        return fallback;
    }
}