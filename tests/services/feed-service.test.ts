import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserProfile, UserSettings, RepoCard, ScoredRepo } from '@/lib/types';
import type { IGitHubClient } from '@/services/github-client';
import type { IFilterService } from '@/services/filter-service';
import type { FeedServiceDeps, GetNextBatchParams } from '@/services/feed-service';
import { createFeedService, parseCursor, encodeCursor } from '@/services/feed-service';
import { COLD_START_THRESHOLD } from '@/services/cold-start-strategy';

// --- Test Fixtures ---

function makeRepo(overrides: Partial<RepoCard> = {}): RepoCard {
  return {
    id: `repo-${Math.random().toString(36).slice(2, 8)}`,
    fullName: 'testuser/testrepo',
    owner: 'testuser',
    name: 'testrepo',
    description: 'A test repository',
    language: 'TypeScript',
    starCount: 500,
    forkCount: 50,
    topics: ['web'],
    isArchived: false,
    isFork: false,
    readmeSummary: 'This is a test repo',
    lastCommitAt: new Date('2024-06-01'),
    defaultBranch: 'main',
    updatedAt: new Date('2024-06-01'),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    languageWeights: { TypeScript: 0.8 },
    topicWeights: { web: 0.7 },
    starRangeWeights: { '100-1000': 0.6 },
    authorWeights: {},
    totalInteractions: 50,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: 'settings-1',
    userId: 'user-1',
    blockForks: false,
    blockedLanguages: [],
    ...overrides,
  };
}

function makeCandidates(count: number): RepoCard[] {
  return Array.from({ length: count }, (_, i) =>
    makeRepo({
      id: `repo-${i}`,
      fullName: `owner/repo-${i}`,
      owner: `owner-${i}`,
      name: `repo-${i}`,
      starCount: (i + 1) * 100,
    })
  );
}

function makeScoredRepos(repos: RepoCard[]): ScoredRepo[] {
  return repos.map((repo, i) => ({
    repo,
    score: 1 - i * 0.1,
    explanation: 'test',
    isExploration: i >= repos.length - Math.ceil(repos.length * 0.2),
  }));
}

// --- Mock Dependencies ---

function createMockDeps(overrides: Partial<FeedServiceDeps> = {}): FeedServiceDeps {
  const candidates = makeCandidates(15);

  const mockGithubClient: IGitHubClient = {
    fetchRepository: vi.fn(),
    fetchTrendingRepos: vi.fn().mockResolvedValue(candidates),
    searchRepos: vi.fn().mockResolvedValue(candidates),
    fetchReadme: vi.fn().mockResolvedValue(null),
    getRateLimitStatus: vi.fn(),
  };

  const mockFilterService: IFilterService = {
    applyFilters: vi.fn((repos: RepoCard[]) => repos),
    isEligible: vi.fn(() => true),
  };

  return {
    getProfile: vi.fn().mockResolvedValue(makeProfile()),
    createDefaultProfile: vi.fn((userId: string) =>
      makeProfile({ userId, totalInteractions: 0 })
    ),
    getUserSettings: vi.fn().mockResolvedValue(makeSettings()),
    githubClient: mockGithubClient,
    filterService: mockFilterService,
    checkSuppression: vi.fn().mockResolvedValue({ blocked: false }),
    generateRecommendations: vi.fn(async (params) => {
      // Return scored repos from the candidates passed in
      return makeScoredRepos(params.candidates.slice(0, params.count));
    }),
    markDelivered: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// --- Tests ---

describe('FeedService', () => {
  describe('getNextBatch', () => {
    it('should return FeedResponse with cards, nextCursor, and hasMore', async () => {
      const deps = createMockDeps();
      const service = createFeedService(deps);

      const result = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      expect(result).toHaveProperty('cards');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.cards)).toBe(true);
      expect(result.cards.length).toBeGreaterThan(0);
    });

    it('should use cold start when profile has < 10 interactions', async () => {
      const coldStartProfile = makeProfile({ totalInteractions: 5 });
      const deps = createMockDeps({
        getProfile: vi.fn().mockResolvedValue(coldStartProfile),
      });
      const service = createFeedService(deps);

      await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      // Cold start uses fetchTrendingRepos with 'weekly' for multiple languages
      // The cold start strategy calls fetchTrendingRepos multiple times
      expect(deps.githubClient.fetchTrendingRepos).toHaveBeenCalled();
    });

    it('should use cold start when profile is null (new user)', async () => {
      const deps = createMockDeps({
        getProfile: vi.fn().mockResolvedValue(null),
      });
      const service = createFeedService(deps);

      await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      // createDefaultProfile should be called, which has totalInteractions=0
      expect(deps.createDefaultProfile).toHaveBeenCalledWith('user-1');
      expect(deps.githubClient.fetchTrendingRepos).toHaveBeenCalled();
    });

    it('should apply content filters', async () => {
      const deps = createMockDeps();
      const service = createFeedService(deps);

      await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      expect(deps.filterService.applyFilters).toHaveBeenCalled();
      // Verify it was called with repos and user settings
      const calls = (deps.filterService.applyFilters as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toBeInstanceOf(Array);
      expect(calls[0][1]).toHaveProperty('blockForks');
      expect(calls[0][1]).toHaveProperty('blockedLanguages');
    });

    it('should check negative feedback suppression for candidates', async () => {
      const candidates = makeCandidates(5);
      const deps = createMockDeps({
        githubClient: {
          fetchRepository: vi.fn(),
          fetchTrendingRepos: vi.fn().mockResolvedValue(candidates),
          searchRepos: vi.fn(),
          fetchReadme: vi.fn(),
          getRateLimitStatus: vi.fn(),
        },
      });
      const service = createFeedService(deps);

      await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      // checkSuppression should be called for each candidate
      expect(deps.checkSuppression).toHaveBeenCalledTimes(5);
    });

    it('should exclude repos blocked by negative feedback', async () => {
      const candidates = makeCandidates(5);
      // Block repo-0 and repo-2
      const checkSuppression = vi.fn(async (_userId: string, repo: RepoCard) => {
        if (repo.id === 'repo-0' || repo.id === 'repo-2') {
          return { blocked: true, reason: 'repo_not_interested' };
        }
        return { blocked: false };
      });

      const deps = createMockDeps({
        githubClient: {
          fetchRepository: vi.fn(),
          fetchTrendingRepos: vi.fn().mockResolvedValue(candidates),
          searchRepos: vi.fn(),
          fetchReadme: vi.fn(),
          getRateLimitStatus: vi.fn(),
        },
        checkSuppression,
      });
      const service = createFeedService(deps);

      await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      // generateRecommendations should receive only non-blocked candidates
      const genCalls = (deps.generateRecommendations as ReturnType<typeof vi.fn>).mock.calls;
      const passedCandidates = genCalls[0][0].candidates as RepoCard[];
      const passedIds = passedCandidates.map((c: RepoCard) => c.id);
      expect(passedIds).not.toContain('repo-0');
      expect(passedIds).not.toContain('repo-2');
      expect(passedIds).toContain('repo-1');
      expect(passedIds).toContain('repo-3');
      expect(passedIds).toContain('repo-4');
    });

    it('should mark delivered repos after returning', async () => {
      const deps = createMockDeps();
      const service = createFeedService(deps);

      const result = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      expect(deps.markDelivered).toHaveBeenCalledWith(
        'user-1',
        'session-1',
        result.cards.map((c) => c.id)
      );
    });

    it('should not call markDelivered when no cards are returned', async () => {
      const deps = createMockDeps({
        generateRecommendations: vi.fn().mockResolvedValue([]),
      });
      const service = createFeedService(deps);

      const result = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      expect(result.cards).toHaveLength(0);
      expect(deps.markDelivered).not.toHaveBeenCalled();
    });

    it('should return hasMore=false when no more candidates', async () => {
      const candidates = makeCandidates(5);
      const deps = createMockDeps({
        githubClient: {
          fetchRepository: vi.fn(),
          fetchTrendingRepos: vi.fn().mockResolvedValue(candidates),
          searchRepos: vi.fn(),
          fetchReadme: vi.fn(),
          getRateLimitStatus: vi.fn(),
        },
        generateRecommendations: vi.fn(async (params) => {
          // Return fewer items than limit
          return makeScoredRepos(params.candidates.slice(0, 5));
        }),
      });
      const service = createFeedService(deps);

      const result = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should return hasMore=true and nextCursor when more results available', async () => {
      const candidates = makeCandidates(20);
      const deps = createMockDeps({
        githubClient: {
          fetchRepository: vi.fn(),
          fetchTrendingRepos: vi.fn().mockResolvedValue(candidates),
          searchRepos: vi.fn(),
          fetchReadme: vi.fn(),
          getRateLimitStatus: vi.fn(),
        },
        generateRecommendations: vi.fn(async (params) => {
          // Return more items than the limit
          return makeScoredRepos(params.candidates.slice(0, 15));
        }),
      });
      const service = createFeedService(deps);

      const result = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 10,
      });

      expect(result.cards.length).toBe(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should use default limit of 10 when not specified', async () => {
      const deps = createMockDeps();
      const service = createFeedService(deps);

      const result = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      // generateRecommendations should be called with count=10
      const genCalls = (deps.generateRecommendations as ReturnType<typeof vi.fn>).mock.calls;
      expect(genCalls[0][0].count).toBe(10);
    });

    it('should pass cursor offset for pagination', async () => {
      const candidates = makeCandidates(20);
      const allScored = makeScoredRepos(candidates);

      const deps = createMockDeps({
        githubClient: {
          fetchRepository: vi.fn(),
          fetchTrendingRepos: vi.fn().mockResolvedValue(candidates),
          searchRepos: vi.fn(),
          fetchReadme: vi.fn(),
          getRateLimitStatus: vi.fn(),
        },
        generateRecommendations: vi.fn(async () => allScored),
      });
      const service = createFeedService(deps);

      // First batch
      const result1 = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        limit: 5,
      });

      expect(result1.cards.length).toBe(5);
      expect(result1.hasMore).toBe(true);

      // Second batch using cursor
      const result2 = await service.getNextBatch({
        userId: 'user-1',
        sessionId: 'session-1',
        cursor: result1.nextCursor!,
        limit: 5,
      });

      expect(result2.cards.length).toBe(5);
      // Cards should be different between batches
      const ids1 = result1.cards.map((c) => c.id);
      const ids2 = result2.cards.map((c) => c.id);
      expect(ids1).not.toEqual(ids2);
    });
  });

  describe('markDelivered', () => {
    it('should delegate to the markDelivered dependency', async () => {
      const deps = createMockDeps();
      const service = createFeedService(deps);

      await service.markDelivered('user-1', 'session-1', ['repo-a', 'repo-b']);

      expect(deps.markDelivered).toHaveBeenCalledWith('user-1', 'session-1', ['repo-a', 'repo-b']);
    });
  });
});

describe('parseCursor', () => {
  it('should return offset 0 for undefined cursor', () => {
    expect(parseCursor(undefined)).toEqual({ offset: 0 });
  });

  it('should return offset 0 for empty string', () => {
    expect(parseCursor('')).toEqual({ offset: 0 });
  });

  it('should parse valid cursor JSON', () => {
    const cursor = JSON.stringify({ offset: 10 });
    expect(parseCursor(cursor)).toEqual({ offset: 10 });
  });

  it('should return offset 0 for invalid JSON', () => {
    expect(parseCursor('not-json')).toEqual({ offset: 0 });
  });

  it('should return offset 0 for negative offset', () => {
    const cursor = JSON.stringify({ offset: -5 });
    expect(parseCursor(cursor)).toEqual({ offset: 0 });
  });
});

describe('encodeCursor', () => {
  it('should encode cursor data to JSON string', () => {
    const result = encodeCursor({ offset: 10 });
    expect(JSON.parse(result)).toEqual({ offset: 10 });
  });
});
