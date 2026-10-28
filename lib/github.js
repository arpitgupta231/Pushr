

const github_api = "https://api.github.com";

export async function getUserData(username, accessToken = null) {
    const tokens = [];
    if (accessToken) tokens.push(accessToken);
    if (process.env.GITHUB_TOKEN && !tokens.includes(process.env.GITHUB_TOKEN)) {
        tokens.push(process.env.GITHUB_TOKEN);
    }
    tokens.push(null);

    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch(`${github_api}/users/${username}`, { headers });
        if (response.status === 401 && i < tokens.length - 1) continue;
        if (!response.ok) {
            throw new Error(`Failed to fetch user data for ${username} (${response.status})`);
        }
        return response.json();
    }
}

export async function getUserRepos(username, accessToken = null) {
    const tokens = [];
    if (accessToken) tokens.push(accessToken);
    if (process.env.GITHUB_TOKEN && !tokens.includes(process.env.GITHUB_TOKEN)) {
        tokens.push(process.env.GITHUB_TOKEN);
    }
    tokens.push(null);

    for (let i = 0; i < tokens.length; i += 1) {
        const response = await fetch(
            `${github_api}/users/${username}/repos?type=owner&per_page=100`,
            { headers: githubHeaders(tokens[i], false) }
        );
        if (response.status === 401 && i < tokens.length - 1) continue;
        if (!response.ok) {
            throw new Error(`Failed to fetch user repos for ${username} (${response.status})`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }
}

export async function getUserStarredCount(username, accessToken = null) {
    if (!username) return 0;
    try {
        const headers = { ...githubHeaders() };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const response = await fetch(`${github_api}/users/${username}/starred?per_page=1`, { headers });
        if (!response.ok) return 0;
        const link = response.headers.get("link") || "";
        const lastMatch = link.match(/page=(\d+)[^>]*>;\s*rel="last"/);
        if (lastMatch && lastMatch[1]) {
            return parseInt(lastMatch[1], 10);
        }
        const data = await response.json();
        return Array.isArray(data) ? data.length : 0;
    } catch {
        return 0;
    }
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


function githubHeaders(accessToken = null, allowEnvFallback = true) {
    const headers = { Accept: "application/vnd.github.v3+json" };
    const token = accessToken || (allowEnvFallback ? process.env.GITHUB_TOKEN : null);
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function getRepoCommitsFromHtml(owner, repoName, sinceIso, maxPages = 10, startPage = 1) {
    const sinceDate = sinceIso ? sinceIso.slice(0, 10) : null;
    const commits = new Map();

    try {
        for (let page = startPage; page < startPage + maxPages; page += 1) {
            const response = await fetch(
                `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commits?page=${page}`,
                { headers: { Accept: "text/html" }, next: { revalidate: 300 } }
            );
            if (!response.ok) break;

            const html = await response.text();
            const embedded = html.match(
                /<script type="application\/json" data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/
            );
            if (!embedded) break;

            const payload = JSON.parse(embedded[1]);
            const groups = payload?.payload?.commitsRoute?.commitGroups ?? [];
            const pageCommits = groups.flatMap((group) => group?.commits ?? []);
            if (pageCommits.length === 0) break;

            let reachedSince = false;
            for (const commit of pageCommits) {
                const rawDate = commit?.committedDate ?? commit?.authoredDate;
                if (!rawDate) continue;
                const date = new Date(rawDate).toISOString().slice(0, 10);
                if (sinceDate && date < sinceDate) {
                    reachedSince = true;
                    continue;
                }
                if (!commit?.oid || commits.has(commit.oid)) continue;
                commits.set(commit.oid, {
                    sha: commit.oid,
                    commit: {
                        message: commit.shortMessage ?? "commit",
                        committer: { date: rawDate },
                        author: { date: commit.authoredDate ?? rawDate },
                    },
                });
            }

            if (reachedSince) break;
        }
    } catch (error) {
        console.error(`[github] HTML commits for ${owner}/${repoName} failed:`, error?.message ?? error);
    }

    return [...commits.values()];
}

// Fetch one REST page of repo commits with token fallback. Result-style so
// initial-history sync can distinguish "repo has no commits" from "fetch
// failed" and avoid marking a repo as initialized on a rate-limit error.
async function fetchRepoCommitsPage(owner, repoName, { perPage, page, sinceIso, accessToken }) {
    const tokens = [];
    if (accessToken) tokens.push(accessToken);
    if (process.env.GITHUB_TOKEN && !tokens.includes(process.env.GITHUB_TOKEN)) {
        tokens.push(process.env.GITHUB_TOKEN);
    }
    tokens.push(null);

    const params = new URLSearchParams({
        per_page: String(perPage),
        page: String(page),
    });
    if (sinceIso) params.set("since", sinceIso);

    let tokenIndex = 0;
    while (true) {
        const fallback = tokenIndex > 0 ? `&token_fallback=${tokenIndex}` : "";
        let response;
        try {
            response = await fetch(
                `${github_api}/repos/${owner}/${repoName}/commits?${params.toString()}${fallback}`,
                { headers: githubHeaders(tokens[tokenIndex], false), next: { revalidate: 300 } }
            );
        } catch (error) {
            return { ok: false, error };
        }

        if (response.status === 401 && tokenIndex < tokens.length - 1) {
            tokenIndex += 1;
            continue;
        }
        if (response.status === 409) {
            return { ok: true, commits: [] };
        }
        if (!response.ok) {
            return { ok: false, status: response.status };
        }

        try {
            const data = await response.json();
            return { ok: true, commits: Array.isArray(data) ? data : [] };
        } catch (error) {
            return { ok: false, error };
        }
    }
}

export async function getRepoCommitsPage(owner, repoName, options = {}) {
    const { perPage = 100, page = 1, since = null, accessToken = null } = options;
    if (!owner || !repoName) return { ok: false, commits: [], error: "missing repository" };
    return fetchRepoCommitsPage(owner, repoName, {
        perPage,
        page,
        sinceIso: since,
        accessToken,
    });
}

export async function getRepoCommits(owner, repoName, options = {}) {
    const { perPage = 100, since = null, sinceDays = null, maxPages = 10, accessToken = null, page = 1 } = options;
    if (!owner || !repoName) return [];

    const sinceIso = since ?? (
        sinceDays
            ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
            : null
    );

    const commits = [];
    try {
        for (let currentPage = page; currentPage < page + maxPages; currentPage += 1) {
            const result = await fetchRepoCommitsPage(owner, repoName, {
                perPage,
                page: currentPage,
                sinceIso,
                accessToken,
            });

            if (!result.ok) {
                const htmlCommits = await getRepoCommitsFromHtml(owner, repoName, sinceIso, maxPages, page);
                if (htmlCommits.length > 0) return htmlCommits;
                if (result.status) {
                    console.error(`[github] commits for ${owner}/${repoName} failed: ${result.status}`);
                } else {
                    console.error(`[github] commits for ${owner}/${repoName} failed:`, result.error);
                }
                break;
            }

            if (result.commits.length === 0) break;
            commits.push(...result.commits);
            if (result.commits.length < perPage) break;
        }
    } catch (error) {
        const htmlCommits = await getRepoCommitsFromHtml(owner, repoName, sinceIso, maxPages, page);
        if (htmlCommits.length > 0) return htmlCommits;
        console.error(`[github] commits for ${owner}/${repoName} failed:`, error);
    }

    return commits;
}

// Normalize one GitHub REST commit (or the HTML fallback shape) into the
// compact record stored in Repository.commits.
export function toCommitRecord(rawCommit, repoFullName = null) {
    const sha = rawCommit?.sha;
    if (!sha) return null;

    return {
        sha,
        message: rawCommit?.commit?.message ?? "",
        url: rawCommit?.html_url ?? (
            repoFullName ? `https://github.com/${repoFullName}/commit/${sha}` : rawCommit?.url ?? null
        ),
        author: rawCommit?.author?.login
            ?? rawCommit?.commit?.author?.name
            ?? rawCommit?.commit?.author?.email
            ?? "unknown",
        committed_at: rawCommit?.commit?.committer?.date
            ?? rawCommit?.commit?.author?.date
            ?? null,
    };
}

// Map a PushEvent's payload commits into the same compact shape. The Events
// API does not include commit timestamps, so use the push event timestamp as
// the best available GitHub timestamp for newly detected commits.
export function getPushEventCommits(event) {
    const repoFullName = event?.repo?.name ?? null;
    const fallbackDate = event?.created_at ?? null;
    const commits = Array.isArray(event?.payload?.commits) ? event.payload.commits : [];

    return commits
        .map((commit) => {
            const sha = commit?.sha;
            if (!sha) return null;
            return {
                sha,
                message: commit.message ?? "",
                url: repoFullName
                    ? `https://github.com/${repoFullName}/commit/${sha}`
                    : commit.url ?? null,
                author: commit.author?.name
                    ?? commit.author?.email
                    ?? event?.actor?.login
                    ?? "unknown",
                committed_at: commit.timestamp ?? fallbackDate,
            };
        })
        .filter(Boolean);
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

// Poll the GitHub Events API for a user's public activity — polling this
// endpoint is the V1 approach. Prefers the per-user OAuth token, falls back
// to GITHUB_TOKEN. Never throws — returns [] on failure.
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
        case "PullRequestReviewEvent": {
            type = "PR";
            metadata.action = "review";
            metadata.reviewAction = payload.action ?? null;
            metadata.reviewState = payload.review?.state ?? null;
            metadata.url = payload.review?.html_url ?? payload.pull_request?.html_url ?? null;
            metadata.number = payload.pull_request?.number ?? null;
            metadata.title = payload.pull_request?.title ?? null;
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
        case "ReleaseEvent": {
            type = "CREATE_REPO";
            metadata.action = "release";
            metadata.releaseAction = payload.action ?? null;
            metadata.name = payload.release?.name ?? null;
            metadata.tagName = payload.release?.tag_name ?? null;
            metadata.url = payload.release?.html_url ?? null;
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

async function getPublicContributionCalendar(username, from, to) {
    try {
        const fromDate = new Date(from).toISOString().slice(0, 10);
        const toDate = new Date(to).toISOString().slice(0, 10);
        const response = await fetch(
            `https://github.com/users/${encodeURIComponent(username)}/contributions?from=${fromDate}&to=${toDate}`,
            { headers: { Accept: "text/html" }, next: { revalidate: 300 } }
        );
        if (!response.ok) return null;

        const html = await response.text();
        const datesById = new Map();
        const cellPattern = /<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g;
        let match;
        while ((match = cellPattern.exec(html))) {
            const id = match[0].match(/\bid="([^"]+)"/)?.[1];
            if (id) datesById.set(id, match[1]);
        }
        if (datesById.size === 0) return null;

        const counts = new Map();
        const tooltipPattern = /<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
        while ((match = tooltipPattern.exec(html))) {
            const date = datesById.get(match[1]);
            if (!date) continue;
            const countMatch = match[2].match(/([\d,]+)\s+contribution/i);
            const count = countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0;
            counts.set(date, count);
        }
        if (counts.size === 0) return null;

        const days = [...counts.entries()]
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        return { ok: true, days, total: days.reduce((sum, day) => sum + day.count, 0) };
    } catch (error) {
        console.error(`[github] public contribution calendar for ${username} failed:`, error?.message ?? error);
        return null;
    }
}

// Result-style core for the contribution calendar: { ok, days, total }.
// `ok: false` means GitHub failed �?" callers must NOT treat empty days as
// "no activity" (persisting that would overwrite real DB stats with zeros).
export async function getUserContributionCalendar(username, from, to, accessToken) {
    const fail = { ok: false, days: [], total: 0 };
    if (!username) return fail;

    const tokens = [];
    if (accessToken) tokens.push(accessToken);
    if (process.env.GITHUB_TOKEN && !tokens.includes(process.env.GITHUB_TOKEN)) {
        tokens.push(process.env.GITHUB_TOKEN);
    }
    if (tokens.length === 0) {
        const publicCalendar = await getPublicContributionCalendar(username, from, to);
        if (publicCalendar) return publicCalendar;
        console.error(`[github] contribution calendar for ${username}: no token available`);
        return fail;
    }

    try {
        let response;
        for (let i = 0; i < tokens.length; i += 1) {
            const requestOptions = {
                method: "POST",
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${tokens[i]}`,
                },
                body: JSON.stringify({
                    query: CONTRIBUTION_CALENDAR_QUERY,
                    variables: { login: username, from, to },
                }),
            };
            if (i === 0) requestOptions.next = { revalidate: 300 };
            else requestOptions.cache = "no-store";

            response = await fetch(github_graphql, requestOptions);
            if (response.status === 401 && i < tokens.length - 1) continue;
            break;
        }
        if (!response.ok) {
            const publicCalendar = await getPublicContributionCalendar(username, from, to);
            if (publicCalendar) return publicCalendar;
            console.error(`[github] contribution calendar for ${username} (${from}..${to}): HTTP ${response.status}`);
            return fail;
        }
        const json = await response.json();
        const calendar = json?.data?.user?.contributionsCollection?.contributionCalendar;
        if (!calendar) {
            const publicCalendar = await getPublicContributionCalendar(username, from, to);
            if (publicCalendar) return publicCalendar;
            console.error(`[github] contribution calendar for ${username}: missing calendar in response`);
            return fail;
        }
        const days = (calendar.weeks || [])
            .flatMap((w) => w?.contributionDays || [])
            .filter((d) => d?.date)
            .map((d) => ({
                date: d.date,
                count: d.contributionCount ?? 0,
                color: d.color ?? null,
            }))
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        return { ok: true, days, total: calendar.totalContributions ?? 0 };
    } catch (e) {
        console.error(`[github] contribution calendar for ${username} threw:`, e?.message ?? e);
        return fail;
    }
}

// Fetch a user's GitHub contribution calendar via the GraphQL API.
// Prefers the per-user OAuth access token from NextAuth (sees the viewer's
// own private contributions); falls back to the server GITHUB_TOKEN PAT for
// public data. Never throws — returns empty data so the dashboard still renders.
// `from`/`to` are ISO datetimes; pass a full-year range and slice quarters client-side.
export async function getUserContributionDays(username, from, to, accessToken) {
    const r = await getUserContributionCalendar(username, from, to, accessToken);
    return { days: r.days, total: r.total };
}

// Count activity streaks from contribution-calendar days.
// `days` are { date: "YYYY-MM-DD", count } in UTC calendar days (ascending).
// A "streak day" is any day with count > 0. The current streak walks back
// from today with one grace day (a quiet today keeps yesterday's run alive).
// Pure + total — feed it getUserContributionDays().days.
export function countContributionStreaks(days) {
    const empty = { current_streak: 0, longest_streak: 0, last_active_date: null, active_today: false };
    const active = new Set();
    for (const d of days || []) {
        if (d?.date && (d.count ?? 0) > 0) active.add(d.date);
    }
    if (active.size === 0) return empty;

    const sorted = [...active].sort();
    const last_active_date = sorted[sorted.length - 1];
    const DAY = 86_400_000;

    let longest_streak = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
        const gap = (new Date(sorted[i] + "T00:00:00Z") - new Date(sorted[i - 1] + "T00:00:00Z")) / DAY;
        if (gap === 1) {
            run += 1;
            if (run > longest_streak) longest_streak = run;
        } else {
            run = 1;
        }
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const active_today = active.has(todayKey);
    let cursor = todayKey;
    if (!active_today) {
        cursor = new Date(Date.now() - DAY).toISOString().slice(0, 10);
        if (!active.has(cursor)) {
            return { current_streak: 0, longest_streak, last_active_date, active_today };
        }
    }
    let current_streak = 0;
    while (active.has(cursor)) {
        current_streak += 1;
        cursor = new Date(new Date(cursor + "T00:00:00Z").getTime() - DAY).toISOString().slice(0, 10);
    }
    return { current_streak, longest_streak, last_active_date, active_today };
}

const USER_CREATED_AT_QUERY = `
  query($login: String!) {
    user(login: $login) {
      createdAt
    }
  }
`;

// Fetch a user's GitHub account creation date — anchors all-time history
// reads (longest-streak-till-date). Returns an ISO datetime or null.
// Never throws.
export async function getUserCreatedAt(username, accessToken) {
    if (!username) return null;
    const token = accessToken || process.env.GITHUB_TOKEN;
    if (!token) {
        console.error(`[github] createdAt for ${username}: no token available`);
        return null;
    }
    try {
        const response = await fetch(github_graphql, {
            method: "POST",
            headers: {
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                query: USER_CREATED_AT_QUERY,
                variables: { login: username },
            }),
            next: { revalidate: 300 },
        });
        if (!response.ok) {
            console.error(`[github] createdAt for ${username}: HTTP ${response.status}`);
            return null;
        }
        const json = await response.json();
        const createdAt = json?.data?.user?.createdAt ?? null;
        if (!createdAt) console.error(`[github] createdAt for ${username}: missing in response`);
        return createdAt;
    } catch (e) {
        console.error(`[github] createdAt for ${username} threw:`, e?.message ?? e);
        return null;
    }
}