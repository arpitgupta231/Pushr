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