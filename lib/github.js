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