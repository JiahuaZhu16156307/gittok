import { describe, it, expect, vi } from 'vitest';
import {
  COLD_START_THRESHOLD,
  shouldUseColdStart,
  generateColdStartCandidates,
  scoreColdStartRepos,
} from '@/services/cold-start-strategy';
import type { IGitHubClient } from '@/services/github-client';
import type { UserProfile, RepoCard } from '@/lib/types';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    languageWeights: {},
    topicWeights: {},
    starRangeWeights: {},
    authorWeights: {},
    totalInteractions: 0,
    ...overrides,
  };
}

function makeRepoCard(overrides: Partial<RepoCard> = {}): RepoCard {
  return {
    id: 'repo-1',
    fullName: 'owner/repo',
    owner: 'owner',
    name: 'repo',
    description: 'A test repo',
    language: 'TypeScript',
    starCount: 1000,
    forkCount: 100,
    topics: ['web'],
    isArchived: false,
    isFork: false,
    readmeSummary: 'Test readme',
    lastCommitAt: new Date(),
    defaultBranch: 'main',
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Cold Start Strategy', () => {
  describe('shouldUseColdStart', () => {
    it('returns true when totalInteractions < 10', () => {
      const profile = makeProfile({ totalInteractions: 0 });
      expect(shouldUseColdStart(profile)).toBe(true);
    });

    it('returns true when totalInteractions is 9 (just below threshold)', () => {
      const profile = makeProfile({ totalInteractions: 9 });
      expect(shouldUseColdStart(profile)).toBe(true);
    });

    it('returns false when totalInteractions equals 10', () => {
      const profile = makeProfile({ totalInteractions: 10 });
      expect(shouldUseColdStart(profile)).toBe(false);
    });

    it('returns false when totalInteractions > 10', () => {
      const profile = makeProfile({ totalInteractions: 50 });
      expect(shouldUseColdStart(profile)).toBe(false);
    });

    it('threshold constant is 10', () => {
      expect(COLD_START_THRESHOLD).toBe(10);
    });
  });

  describe('generateColdStartCandidates', () => {
    it('fetches trending repos for general and popular languages', async () => {
      const mockClient: IGitHubClient = {
        fetchRepository: vi.fn(),
        fetchTrendingRepos: vi.fn().mockResolvedValue([]),
        searchRepos: vi.fn(),
        fetchReadme: vi.fn(),
        getRateLimitStatus: vi.fn(),
      };

      await generateColdStartCandidates(mockClient);

      // Should be called once for general (undefined language) + 5 popular languages
      expect(mockClient.fetchTrendingRepos).toHaveBeenCalledTimes(6);
      expect(mockClient.fetchTrendingRepos).toHaveBeenCalledWith(undefined, 'weekly');
      expect(mockClient.fetchTrendingRepos).toHaveBeenCalledWith('TypeScript', 'weekly');
      expect(mockClient.fetchTrendingRepos).toHaveBeenCalledWith('Python', 'weekly');
      expect(mockClient.fetchTrendingRepos).toHaveBeenCalledWith('Rust', 'weekly');
      expect(mockClient.fetchTrendingRepos).toHaveBeenCalledWith('Go', 'weekly');
      expect(mockClient.fetchTrendingRepos).toHaveBeenCalledWith('Java', 'weekly');
    });

    it('deduplicates repos by ID', async () => {
      const sharedRepo = makeRepoCard({ id: 'shared-1', name: 'shared' });
      const uniqueRepo = makeRepoCard({ id: 'unique-1', name: 'unique' });

      const mockClient: IGitHubClient = {
        fetchRepository: vi.fn(),
        fetchTrendingRepos: vi.fn()
          .mockResolvedValueOnce([sharedRepo, uniqueRepo]) // general
          .mockResolvedValueOnce([sharedRepo]) // TypeScript
          .mockResolvedValueOnce([]) // Python
          .mockResolvedValueOnce([]) // Rust
          .mockResolvedValueOnce([]) // Go
          .mockResolvedValueOnce([]), // Java
        searchRepos: vi.fn(),
        fetchReadme: vi.fn(),
        getRateLimitStatus: vi.fn(),
      };

      const result = await generateColdStartCandidates(mockClient);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['shared-1', 'unique-1']);
    });
  });

  describe('scoreColdStartRepos', () => {
    it('sorts repos by score in descending order', () => {
      const repos = [
        makeRepoCard({ id: '1', starCount: 10, lastCommitAt: new Date() }),
        makeRepoCard({ id: '2', starCount: 10000, lastCommitAt: new Date() }),
        makeRepoCard({ id: '3', starCount: 100, lastCommitAt: new Date() }),
      ];

      const scored = scoreColdStartRepos(repos);

      for (let i = 0; i < scored.length - 1; i++) {
        expect(scored[i].score).toBeGreaterThanOrEqual(scored[i + 1].score);
      }
    });

    it('favors high-star repos (higher star count = higher score, same recency)', () => {
      const now = new Date();
      const repos = [
        makeRepoCard({ id: 'low-stars', starCount: 10, lastCommitAt: now }),
        makeRepoCard({ id: 'high-stars', starCount: 100000, lastCommitAt: now }),
      ];

      const scored = scoreColdStartRepos(repos);

      const highStarScore = scored.find((s) => s.repo.id === 'high-stars')!.score;
      const lowStarScore = scored.find((s) => s.repo.id === 'low-stars')!.score;

      expect(highStarScore).toBeGreaterThan(lowStarScore);
    });

    it('favors recent repos (more recent commit = higher score, same stars)', () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const repos = [
        makeRepoCard({ id: 'old-repo', starCount: 1000, lastCommitAt: thirtyDaysAgo }),
        makeRepoCard({ id: 'recent-repo', starCount: 1000, lastCommitAt: now }),
      ];

      const scored = scoreColdStartRepos(repos);

      const recentScore = scored.find((s) => s.repo.id === 'recent-repo')!.score;
      const oldScore = scored.find((s) => s.repo.id === 'old-repo')!.score;

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('marks all items as isExploration: false', () => {
      const repos = [
        makeRepoCard({ id: '1', starCount: 100 }),
        makeRepoCard({ id: '2', starCount: 200 }),
      ];

      const scored = scoreColdStartRepos(repos);

      for (const item of scored) {
        expect(item.isExploration).toBe(false);
      }
    });

    it('returns empty array for empty input', () => {
      const scored = scoreColdStartRepos([]);
      expect(scored).toEqual([]);
    });
  });
});
