const github_api = "https://api.github.com";

export async function getUserData(username) {
    const response = await fetch(`${github_api}/users/${username}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch user data for ${username}`);
    }
    const data = await response.json();
    return data;
}