const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LEVEL = 4;
const RECENT_COMMIT_LIMIT = 10;
const MESSAGE_LIMIT = 100;

const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

export const QUARTERS = [
    { key: "Q1", label: "Q1", name: "Jan – Mar", startMonth: 0, endMonth: 2 },
    { key: "Q2", label: "Q2", name: "Apr – Jun", startMonth: 3, endMonth: 5 },
    { key: "Q3", label: "Q3", name: "Jul – Sep", startMonth: 6, endMonth: 8 },
    { key: "Q4", label: "Q4", name: "Oct – Dec", startMonth: 9, endMonth: 11 },
];

function pad(value) {
    return String(value).padStart(2, "0");
}

function resolveYear(year) {
    const value = Number(year);
    return Number.isInteger(value) ? value : new Date().getFullYear();
}

function toUtcKey(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function toUtcDateKey(dateInput) {
    if (!dateInput) return null;
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) return null;
    return toUtcKey(date);
}

export function formatUtcDay(dateString) {
    if (!dateString) return "";
    const [year, month, day] = String(dateString).split("-").map(Number);
    if (!year || !month || !day) return "";
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });
}

function normalizeAuthor(author) {
    const value =
        typeof author === "string"
            ? author
            : author?.login ?? author?.name ?? author?.email ?? "";
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : "unknown";
}

function shortMessage(message) {
    const firstLine = String(message ?? "").split("\n")[0].trim();
    if (firstLine.length === 0) return "commit";
    return firstLine.length > MESSAGE_LIMIT
        ? `${firstLine.slice(0, MESSAGE_LIMIT - 1)}…`
        : firstLine;
}

export function normalizeCommits(rawCommits) {
    if (!Array.isArray(rawCommits)) return [];
    const bySha = new Map();

    for (const raw of rawCommits) {
        if (!raw || typeof raw.sha !== "string" || raw.sha.length === 0) continue;

        const committedAt = toUtcDateKey(raw.committed_at);
        const record = {
            sha: raw.sha,
            message: String(raw.message ?? ""),
            url: typeof raw.url === "string" && raw.url.length > 0 ? raw.url : null,
            author: normalizeAuthor(raw.author),
            avatar_url: raw.avatar_url ?? raw.authorAvatar ?? null,
            committed_at: committedAt ? new Date(committedAt).toISOString() : null,
        };

        const existing = bySha.get(record.sha);
        if (!existing) {
            bySha.set(record.sha, record);
        } else if (!existing.committed_at && record.committed_at) {
            bySha.set(record.sha, record);
        }
    }

    return [...bySha.values()];
}

function sortNewestFirst(commits) {
    return commits.slice().sort((a, b) => {
        const aTime = a.committed_at ? new Date(a.committed_at).getTime() : 0;
        const bTime = b.committed_at ? new Date(b.committed_at).getTime() : 0;
        return bTime - aTime;
    });
}

function levelFor(count, max) {
    if (count <= 0 || max <= 0) return 0;
    return Math.min(MAX_LEVEL, Math.ceil((count / max) * MAX_LEVEL));
}

export function aggregateQuarterCommits(rawCommits, year = new Date().getFullYear()) {
    const resolvedYear = resolveYear(year);
    const commits = normalizeCommits(rawCommits);

    const counts = new Map();
    const commitsByDateMap = new Map();

    for (const commit of commits) {
        if (!commit.committed_at) continue;
        const dateKey = commit.committed_at.slice(0, 10);
        counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);

        const list = commitsByDateMap.get(dateKey) || [];
        list.push({
            sha: commit.sha,
            shortSha: commit.sha.slice(0, 7),
            message: shortMessage(commit.message),
            fullMessage: commit.message,
            author: commit.author,
            avatar_url: commit.avatar_url,
            committed_at: commit.committed_at,
            url: commit.url,
        });
        commitsByDateMap.set(dateKey, list);
    }

    const yearStart = Date.UTC(resolvedYear, 0, 1);
    const nextYearStart = Date.UTC(resolvedYear + 1, 0, 1);
    const dayCount = Math.round((nextYearStart - yearStart) / DAY_MS);

    const days = [];
    let maxDaily = 0;
    for (let index = 0; index < dayCount; index += 1) {
        const date = new Date(yearStart + index * DAY_MS);
        const dateKey = toUtcKey(date);
        const count = counts.get(dateKey) ?? 0;
        if (count > maxDaily) maxDaily = count;
        days.push({ date: dateKey, count, level: 0 });
    }
    for (const day of days) {
        day.level = levelFor(day.count, maxDaily);
    }

    const quarters = QUARTERS.map((quarter) => {
        const start = new Date(Date.UTC(resolvedYear, quarter.startMonth, 1));
        const end = new Date(Date.UTC(resolvedYear, quarter.endMonth + 1, 0));
        const startKey = toUtcKey(start);
        const endKey = toUtcKey(end);

        let count = 0;
        for (const day of days) {
            if (day.date >= startKey && day.date <= endKey) count += day.count;
        }

        return {
            key: quarter.key,
            label: quarter.label,
            name: quarter.name,
            startMonth: quarter.startMonth,
            endMonth: quarter.endMonth,
            start: startKey,
            end: endKey,
            count,
        };
    });

    const totalCommitsInYear = quarters.reduce((total, quarter) => total + quarter.count, 0);

    let peakDay = null;
    for (const day of days) {
        if (day.count > 0 && (!peakDay || day.count > peakDay.count)) peakDay = day;
    }

    let peakQuarter = null;
    for (const quarter of quarters) {
        if (quarter.count > 0 && (!peakQuarter || quarter.count > peakQuarter.count)) {
            peakQuarter = quarter;
        }
    }

    const sortedCommits = sortNewestFirst(commits);

    const recentCommits = sortedCommits
        .slice(0, RECENT_COMMIT_LIMIT)
        .map((commit) => ({
            sha: commit.sha,
            shortSha: commit.sha.slice(0, 7),
            message: shortMessage(commit.message),
            author: commit.author,
            avatar_url: commit.avatar_url,
            committed_at: commit.committed_at,
            url: commit.url,
        }));

    const commitsByDate = {};
    for (const [dateKey, list] of commitsByDateMap.entries()) {
        commitsByDate[dateKey] = list;
    }

    return {
        year: resolvedYear,
        days,
        quarters,
        totalCommits: commits.length,
        totalCommitsInYear,
        mostActiveDay: peakDay ? { date: peakDay.date, count: peakDay.count } : null,
        mostActiveQuarter: peakQuarter,
        recentCommits,
        commitsByDate,
        allCommits: sortedCommits.map((c) => ({
            sha: c.sha,
            shortSha: c.sha.slice(0, 7),
            message: c.message,
            author: c.author,
            avatar_url: c.avatar_url,
            committed_at: c.committed_at,
            url: c.url,
        })),
    };
}

function loginLike(author) {
    return /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(author);
}

function fallbackAvatar(author) {
    return `https://github.com/identicons/${encodeURIComponent(author)}.png`;
}

function fallbackProfileUrl(author) {
    return loginLike(author) ? `https://github.com/${author}` : null;
}

export function deriveContributors(rawCommits, githubContributors = []) {
    const commits = normalizeCommits(rawCommits);

    const contributorsByAuthor = new Map();
    for (const commit of commits) {
        const key = commit.author.toLowerCase();
        const existing = contributorsByAuthor.get(key);
        if (existing) {
            existing.author = commit.author;
            existing.commitCount += 1;
        } else {
            contributorsByAuthor.set(key, {
                author: commit.author,
                commitCount: 1,
            });
        }
    }

    const merged = new Map();

    // 1. Process all contributors returned by GitHub REST API
    if (Array.isArray(githubContributors)) {
        for (const contributor of githubContributors) {
            const login = contributor?.login;
            if (typeof login === "string" && login.length > 0) {
                const key = login.toLowerCase();
                const ghContributions = typeof contributor.contributions === "number" ? contributor.contributions : 0;
                const localAuthor = contributorsByAuthor.get(key);
                const localCount = localAuthor?.commitCount ?? 0;
                const count = Math.max(ghContributions, localCount);

                merged.set(key, {
                    login: contributor.login,
                    name: contributor.name || contributor.login,
                    author: contributor.login,
                    commitCount: count,
                    commits: count,
                    avatar_url: contributor.avatar_url || fallbackAvatar(contributor.login),
                    avatarUrl: contributor.avatar_url || fallbackAvatar(contributor.login),
                    html_url: contributor.html_url || `https://github.com/${contributor.login}`,
                    htmlUrl: contributor.html_url || `https://github.com/${contributor.login}`,
                    isRegistered: true,
                });
            }
        }
    }

    // 2. Merge authors from rawCommits that weren't present in githubContributors
    for (const [key, entry] of contributorsByAuthor.entries()) {
        if (!merged.has(key)) {
            const avatarUrl = fallbackAvatar(entry.author);
            const htmlUrl = fallbackProfileUrl(entry.author);
            merged.set(key, {
                login: entry.author,
                name: entry.author,
                author: entry.author,
                commitCount: entry.commitCount,
                commits: entry.commitCount,
                avatar_url: avatarUrl,
                avatarUrl,
                html_url: htmlUrl,
                htmlUrl,
                isRegistered: loginLike(entry.author),
            });
        }
    }

    const allContributors = [...merged.values()];
    const totalCommits = allContributors.reduce((sum, c) => sum + c.commitCount, 0);

    return allContributors
        .map((contrib) => ({
            ...contrib,
            percentage:
                totalCommits > 0
                    ? Math.round((contrib.commitCount / totalCommits) * 1000) / 10
                    : 0,
        }))
        .sort(
            (a, b) =>
                b.commitCount - a.commitCount ||
                a.author.localeCompare(b.author)
        );
}

export function aggregateRepositoryInsights(rawCommits, year = new Date().getFullYear()) {
    const insights = aggregateQuarterCommits(rawCommits, year);

    return {
        ...insights,
        totalCommitsAllTime: insights.totalCommits,
        totalCommitsYear: insights.totalCommitsInYear,
        mostActiveDay: insights.mostActiveDay ?? { date: null, count: 0 },
        mostActiveQuarter: insights.mostActiveQuarter
            ? { ...insights.mostActiveQuarter, total: insights.mostActiveQuarter.count }
            : { label: null, total: 0 },
        recentCommits: insights.recentCommits.map((commit) => ({
            ...commit,
            shortSha: commit.sha.slice(0, 7),
        })),
    };
}

export { MONTH_NAMES };
