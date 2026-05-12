import { redis, repoKey, readmeKey, TTL_REPO_CACHE, TTL_README_CACHE } from '@/lib/redis';
import { truncateReadme } from '@/lib/utils/truncate-readme';
import type { RepoData, RateLimitInfo } from '@/lib/types';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Interface for the GitHub API client.
 */
export interface IGitHubClient {
  fetchRepository(owner: string, repo: string): Promise<RepoData>;
  fetchTrendingRepos(language?: string, since?: 'daily' | 'weekly'): Promise<RepoData[]>;
  searchRepos(query: string, sort?: string, perPage?: number, page?: number): Promise<RepoData[]>;
  fetchReadme(owner: string, repo: string): Promise<string | null>;
  getRateLimitStatus(): Promise<RateLimitInfo>;
}

/**
 * Maps a raw GitHub API repository response to our RepoData interface.
 */
function mapGitHubRepoToRepoData(item: Record<string, unknown>): RepoData {
  const owner = item.owner as Record<string, unknown> | undefined;
  return {
    id: String(item.id ?? ''),
    fullName: String(item.full_name ?? ''),
    owner: owner ? String(owner.login ?? '') : '',
    name: String(item.name ?? ''),
    description: String(item.description ?? ''),
    language: item.language ? String(item.language) : null,
    starCount: Number(item.stargazers_count ?? 0),
    forkCount: Number(item.forks_count ?? 0),
    topics: Array.isArray(item.topics) ? (item.topics as string[]) : [],
    isArchived: Boolean(item.archived),
    isFork: Boolean(item.fork),
    readmeSummary: '',
    lastCommitAt: new Date(String(item.pushed_at ?? new Date().toISOString())),
    defaultBranch: String(item.default_branch ?? 'main'),
    updatedAt: new Date(String(item.updated_at ?? new Date().toISOString())),
  };
}

/**
 * Serializes a RepoData object to a JSON string for Redis storage.
 * Dates are stored as ISO strings.
 */
function serializeRepoData(repo: RepoData): string {
  return JSON.stringify({
    ...repo,
    lastCommitAt: repo.lastCommitAt instanceof Date ? repo.lastCommitAt.toISOString() : repo.lastCommitAt,
    updatedAt: repo.updatedAt instanceof Date ? repo.updatedAt.toISOString() : repo.updatedAt,
  });
}

/**
 * Deserializes a JSON string from Redis back to a RepoData object.
 */
function deserializeRepoData(json: string): RepoData {
  const parsed = JSON.parse(json);
  return {
    ...parsed,
    lastCommitAt: new Date(parsed.lastCommitAt),
    updatedAt: new Date(parsed.updatedAt),
  };
}

/**
 * Creates a GitHub API client with optional authentication token.
 *
 * @param token - Optional GitHub personal access token for authenticated requests
 * @returns An IGitHubClient implementation
 */
export function createGitHubClient(token?: string): IGitHubClient {
  function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitTok/1.0',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function githubFetch(path: string): Promise<Response> {
    const url = `${GITHUB_API_BASE}${path}`;
    const response = await fetch(url, { headers: getHeaders() });
    return response;
  }

  async function fetchRepository(owner: string, repo: string): Promise<RepoData> {
    // Check Redis cache first
    const cacheKey = repoKey(owner, repo);
    const cached = await redis.get(cacheKey);
    if (cached) {
      return deserializeRepoData(cached);
    }

    // Fetch from GitHub API
    const response = await githubFetch(`/repos/${owner}/${repo}`);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const repoData = mapGitHubRepoToRepoData(data);

    // Cache in Redis with 24h TTL
    await redis.setex(cacheKey, TTL_REPO_CACHE, serializeRepoData(repoData));

    return repoData;
  }

  async function fetchTrendingRepos(language?: string, since?: 'daily' | 'weekly'): Promise<RepoData[]> {
    // Calculate the date threshold based on 'since' parameter
    const now = new Date();
    const daysAgo = since === 'weekly' ? 7 : 1;
    const dateThreshold = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const dateStr = dateThreshold.toISOString().split('T')[0];

    // Build search query
    let query = `stars:>100+pushed:>${dateStr}`;
    if (language) {
      query += `+language:${encodeURIComponent(language)}`;
    }

    const response = await githubFetch(`/search/repositories?q=${query}&sort=stars&order=desc&per_page=100`);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const items = (data.items ?? []) as Record<string, unknown>[];
    return items.map(mapGitHubRepoToRepoData);
  }

  async function searchRepos(query: string, sort?: string, perPage?: number, page?: number): Promise<RepoData[]> {
    const params = new URLSearchParams({ q: query });
    if (sort) {
      params.set('sort', sort);
    }
    if (perPage) {
      params.set('per_page', String(perPage));
    }
    if (page && page > 1) {
      params.set('page', String(page));
    }

    const response = await githubFetch(`/search/repositories?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const items = (data.items ?? []) as Record<string, unknown>[];
    return items.map(mapGitHubRepoToRepoData);
  }

  async function fetchReadme(owner: string, repo: string): Promise<string | null> {
    // Check Redis cache first
    const cacheKey = readmeKey(owner, repo);
    const cached = await redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch README from GitHub API
    const response = await githubFetch(`/repos/${owner}/${repo}/readme`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // GitHub returns README content as base64 encoded
    const content = data.content
      ? Buffer.from(String(data.content), 'base64').toString('utf-8')
      : null;

    if (!content) {
      return null;
    }

    // Truncate to 500 characters
    const truncated = truncateReadme(content);

    // Cache the truncated README with 24h TTL
    await redis.setex(cacheKey, TTL_README_CACHE, truncated);

    return truncated;
  }

  async function getRateLimitStatus(): Promise<RateLimitInfo> {
    const response = await githubFetch('/rate_limit');
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const core = data.resources?.core ?? data.rate ?? {};

    return {
      remaining: Number(core.remaining ?? 0),
      limit: Number(core.limit ?? 60),
      resetAt: new Date(Number(core.reset ?? 0) * 1000),
    };
  }

  return {
    fetchRepository,
    fetchTrendingRepos,
    searchRepos,
    fetchReadme,
    getRateLimitStatus,
  };
}
