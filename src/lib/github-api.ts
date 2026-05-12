/**
 * GitHub API helper functions for star and follow operations.
 *
 * All functions require a valid GitHub access token.
 * Uses the GitHub REST API v3.
 */

const GITHUB_API_BASE = "https://api.github.com";

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Star a repository.
 * PUT /user/starred/{owner}/{repo} → 204 on success
 */
export async function starRepo(
  token: string,
  owner: string,
  repo: string
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/starred/${owner}/${repo}`,
    { method: "PUT", headers: headers(token) }
  );
  return res.status === 204;
}

/**
 * Unstar a repository.
 * DELETE /user/starred/{owner}/{repo} → 204 on success
 */
export async function unstarRepo(
  token: string,
  owner: string,
  repo: string
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/starred/${owner}/${repo}`,
    { method: "DELETE", headers: headers(token) }
  );
  return res.status === 204;
}

/**
 * Check if a repository is starred by the authenticated user.
 * GET /user/starred/{owner}/{repo} → 204 if starred, 404 if not
 */
export async function isRepoStarred(
  token: string,
  owner: string,
  repo: string
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/starred/${owner}/${repo}`,
    { method: "GET", headers: headers(token) }
  );
  return res.status === 204;
}

/**
 * Get the authenticated user's starred repositories.
 * GET /user/starred → array of repository objects
 */
export async function getStarredRepos(
  token: string,
  page: number = 1,
  perPage: number = 30
): Promise<any[]> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/starred?page=${page}&per_page=${perPage}&sort=created&direction=desc`,
    { method: "GET", headers: headers(token) }
  );
  if (!res.ok) return [];
  return res.json();
}

/**
 * Follow a GitHub user.
 * PUT /user/following/{username} → 204 on success
 */
export async function followUser(
  token: string,
  username: string
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/following/${username}`,
    { method: "PUT", headers: headers(token) }
  );
  return res.status === 204;
}

/**
 * Unfollow a GitHub user.
 * DELETE /user/following/{username} → 204 on success
 */
export async function unfollowUser(
  token: string,
  username: string
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/following/${username}`,
    { method: "DELETE", headers: headers(token) }
  );
  return res.status === 204;
}

/**
 * Check if the authenticated user is following a given user.
 * GET /user/following/{username} → 204 if following, 404 if not
 */
export async function isFollowing(
  token: string,
  username: string
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/following/${username}`,
    { method: "GET", headers: headers(token) }
  );
  return res.status === 204;
}

/**
 * Get the list of users the authenticated user is following.
 * GET /user/following → array of user objects
 */
export async function getFollowing(
  token: string,
  page: number = 1,
  perPage: number = 30
): Promise<any[]> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/following?page=${page}&per_page=${perPage}`,
    { method: "GET", headers: headers(token) }
  );
  if (!res.ok) return [];
  return res.json();
}
