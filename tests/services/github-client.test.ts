import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the redis module before importing the client
vi.mock('@/lib/redis', () => {
  const store = new Map<string, string>();
  return {
    redis: {
      get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: vi.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      setex: vi.fn((key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      _store: store,
    },
    repoKey: (owner: string, name: string) => `repo:${owner}/${name}`,
    readmeKey: (owner: string, name: string) => `readme:${owner}/${name}`,
    TTL_REPO_CACHE: 86400,
    TTL_README_CACHE: 86400,
  };
});

import { createGitHubClient, type IGitHubClient } from '@/services/github-client';
import { redis } from '@/lib/redis';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Access the internal store from the mocked redis
const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  setex: ReturnType<typeof vi.fn>;
  _store: Map<string, string>;
};

function createMockGitHubRepoResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 12345,
    full_name: 'octocat/hello-world',
    name: 'hello-world',
    owner: { login: 'octocat' },
    description: 'A test repository',
    language: 'TypeScript',
    stargazers_count: 1000,
    forks_count: 200,
    topics: ['web', 'typescript'],
    archived: false,
    fork: false,
    pushed_at: '2024-01-15T10:00:00Z',
    default_branch: 'main',
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('GitHub Client', () => {
  let client: IGitHubClient;

  beforeEach(() => {
    mockRedis._store.clear();
    mockRedis.get.mockClear();
    mockRedis.set.mockClear();
    mockRedis.setex.mockClear();
    mockFetch.mockReset();
    client = createGitHubClient('test-token');
  });

  describe('fetchRepository', () => {
    it('should fetch a repository from GitHub API and cache it', async () => {
      const mockRepo = createMockGitHubRepoResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepo),
      });

      const result = await client.fetchRepository('octocat', 'hello-world');

      expect(result.id).toBe('12345');
      expect(result.fullName).toBe('octocat/hello-world');
      expect(result.owner).toBe('octocat');
      expect(result.name).toBe('hello-world');
      expect(result.description).toBe('A test repository');
      expect(result.language).toBe('TypeScript');
      expect(result.starCount).toBe(1000);
      expect(result.forkCount).toBe(200);
      expect(result.topics).toEqual(['web', 'typescript']);
      expect(result.isArchived).toBe(false);
      expect(result.isFork).toBe(false);
      expect(result.defaultBranch).toBe('main');

      // Verify it was cached
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'repo:octocat/hello-world',
        86400,
        expect.any(String)
      );
    });

    it('should return cached data without calling GitHub API', async () => {
      const cachedRepo = {
        id: '12345',
        fullName: 'octocat/hello-world',
        owner: 'octocat',
        name: 'hello-world',
        description: 'Cached repo',
        language: 'TypeScript',
        starCount: 1000,
        forkCount: 200,
        topics: ['web'],
        isArchived: false,
        isFork: false,
        readmeSummary: '',
        lastCommitAt: '2024-01-15T10:00:00.000Z',
        defaultBranch: 'main',
        updatedAt: '2024-01-15T10:00:00.000Z',
      };
      mockRedis._store.set('repo:octocat/hello-world', JSON.stringify(cachedRepo));

      const result = await client.fetchRepository('octocat', 'hello-world');

      expect(result.fullName).toBe('octocat/hello-world');
      expect(result.description).toBe('Cached repo');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.fetchRepository('octocat', 'nonexistent'))
        .rejects.toThrow('GitHub API error: 404 Not Found');
    });
  });

  describe('fetchTrendingRepos', () => {
    it('should fetch trending repos using search API', async () => {
      const mockResponse = {
        items: [
          createMockGitHubRepoResponse({ id: 1, full_name: 'user/repo1' }),
          createMockGitHubRepoResponse({ id: 2, full_name: 'user/repo2' }),
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.fetchTrendingRepos();

      expect(result).toHaveLength(2);
      expect(result[0].fullName).toBe('user/repo1');
      expect(result[1].fullName).toBe('user/repo2');

      // Verify the search query includes stars:>100 and pushed:> date
      const fetchCall = mockFetch.mock.calls[0][0] as string;
      expect(fetchCall).toContain('/search/repositories');
      expect(fetchCall).toContain('stars:>100');
      expect(fetchCall).toContain('sort=stars');
    });

    it('should filter by language when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await client.fetchTrendingRepos('TypeScript');

      const fetchCall = mockFetch.mock.calls[0][0] as string;
      expect(fetchCall).toContain('language:TypeScript');
    });

    it('should use 7-day window for weekly since parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await client.fetchTrendingRepos(undefined, 'weekly');

      const fetchCall = mockFetch.mock.calls[0][0] as string;
      // The date should be 7 days ago
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];
      expect(fetchCall).toContain(dateStr);
    });
  });

  describe('searchRepos', () => {
    it('should search repos with query', async () => {
      const mockResponse = {
        items: [createMockGitHubRepoResponse()],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.searchRepos('react framework');

      expect(result).toHaveLength(1);
      const fetchCall = mockFetch.mock.calls[0][0] as string;
      expect(fetchCall).toContain('q=react+framework');
    });

    it('should include sort parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await client.searchRepos('test', 'stars');

      const fetchCall = mockFetch.mock.calls[0][0] as string;
      expect(fetchCall).toContain('sort=stars');
    });

    it('should include per_page parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await client.searchRepos('test', undefined, 20);

      const fetchCall = mockFetch.mock.calls[0][0] as string;
      expect(fetchCall).toContain('per_page=20');
    });
  });

  describe('fetchReadme', () => {
    it('should fetch and truncate README content', async () => {
      const readmeContent = 'A'.repeat(1000);
      const base64Content = Buffer.from(readmeContent).toString('base64');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: base64Content }),
      });

      const result = await client.fetchReadme('octocat', 'hello-world');

      expect(result).not.toBeNull();
      expect(result!.length).toBe(500);
      expect(result).toBe('A'.repeat(500));

      // Verify it was cached
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'readme:octocat/hello-world',
        86400,
        'A'.repeat(500)
      );
    });

    it('should return cached README without calling API', async () => {
      mockRedis._store.set('readme:octocat/hello-world', 'Cached README');

      const result = await client.fetchReadme('octocat', 'hello-world');

      expect(result).toBe('Cached README');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null for 404 (no README)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await client.fetchReadme('octocat', 'no-readme');

      expect(result).toBeNull();
    });

    it('should return short README without truncation', async () => {
      const shortContent = 'Short README';
      const base64Content = Buffer.from(shortContent).toString('base64');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: base64Content }),
      });

      const result = await client.fetchReadme('octocat', 'hello-world');

      expect(result).toBe('Short README');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit info from GitHub API', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          resources: {
            core: {
              remaining: 4500,
              limit: 5000,
              reset: resetTime,
            },
          },
        }),
      });

      const result = await client.getRateLimitStatus();

      expect(result.remaining).toBe(4500);
      expect(result.limit).toBe(5000);
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.resetAt.getTime()).toBe(resetTime * 1000);
    });
  });

  describe('authentication', () => {
    it('should include Authorization header when token is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          resources: { core: { remaining: 5000, limit: 5000, reset: 0 } },
        }),
      });

      const authenticatedClient = createGitHubClient('my-token');
      await authenticatedClient.getRateLimitStatus();

      const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOptions.headers).toHaveProperty('Authorization', 'Bearer my-token');
    });

    it('should not include Authorization header when no token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          resources: { core: { remaining: 60, limit: 60, reset: 0 } },
        }),
      });

      const unauthClient = createGitHubClient();
      await unauthClient.getRateLimitStatus();

      const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOptions.headers).not.toHaveProperty('Authorization');
    });
  });
});
