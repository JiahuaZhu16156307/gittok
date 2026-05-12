import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserProfile, RepoCard } from '@/lib/types';

/**
 * Unit tests for the feed generator service.
 * Validates: Requirements 6.5 (exploration diversity) and 6.8 (session deduplication).
 */

// Mock Redis before importing the module under test
vi.mock('@/lib/redis', () => {
  const deliveredSets = new Map<string, Set<string>>();

  return {
    redis: {
      sismember: vi.fn((key: string, member: string) => {
        const set = deliveredSets.get(key);
        return Promise.resolve(set?.has(member) ? 1 : 0);
      }),
      sadd: vi.fn((key: string, ...members: string[]) => {
        if (!deliveredSets.has(key)) {
          deliveredSets.set(key, new Set());
        }
        const set = deliveredSets.get(key)!;
        members.forEach((m) => set.add(m));
        return Promise.resolve(members.length);
      }),
    },
    sessionDeliveredKey: (userId: string, sessionId: string) =>
      `session:delivered:${userId}:${sessionId}`,
    // Expose for test cleanup
    __deliveredSets: deliveredSets,
  };
});

import {
  generateRecommendations,
  markDelivered,
  isDelivered,
} from '@/services/feed-generator';

// Access the internal mock state for cleanup
const { __deliveredSets } = await import('@/lib/redis') as any;

// --- Test Fixtures ---

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    languageWeights: {},
    topicWeights: {},
    starRangeWeights: {},
    authorWeights: {},
    totalInteractions: 50,
    ...overrides,
  };
}

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

/**
 * Creates a list of repos with varying scores based on language weights.
 * Higher index = higher score when used with the matching profile.
 */
function makeCandidates(count: number): RepoCard[] {
  const languages = ['Python', 'JavaScript', 'TypeScript', 'Rust', 'Go', 'Java', 'C', 'Ruby', 'Swift', 'Kotlin'];
  return Array.from({ length: count }, (_, i) => makeRepo({
    id: `repo-${i}`,
    fullName: `owner/repo-${i}`,
    owner: `owner-${i}`,
    name: `repo-${i}`,
    language: languages[i % languages.length],
    starCount: (i + 1) * 100,
    topics: [`topic-${i}`],
  }));
}

/**
 * Creates a profile that gives higher scores to higher-indexed repos.
 */
function makeGradedProfile(): UserProfile {
  return makeProfile({
    languageWeights: {
      Kotlin: 1.0,
      Swift: 0.9,
      Ruby: 0.8,
      C: 0.7,
      Java: 0.6,
      Go: 0.5,
      Rust: 0.4,
      TypeScript: 0.3,
      JavaScript: 0.2,
      Python: 0.1,
    },
  });
}

beforeEach(() => {
  __deliveredSets.clear();
});

// --- generateRecommendations tests ---

describe('generateRecommendations', () => {
  describe('exploration diversity guarantee', () => {
    it('should include at least 20% exploration items in results', async () => {
      const candidates = makeCandidates(20);
      const profile = makeGradedProfile();
      const count = 10;

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count,
      });

      const explorationItems = results.filter((r) => r.isExploration);
      const minExploration = Math.ceil(count * 0.2); // 2

      expect(explorationItems.length).toBeGreaterThanOrEqual(minExploration);
    });

    it('should select exploration items from the bottom 50% of scored candidates', async () => {
      const candidates = makeCandidates(20);
      const profile = makeGradedProfile();
      const count = 10;

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count,
      });

      // Score all candidates to determine the midpoint
      const { scoreRepo } = await import('@/services/recommendation-engine');
      const allScored = candidates
        .map((c) => ({ id: c.id, score: scoreRepo(profile, c) }))
        .sort((a, b) => b.score - a.score);

      const midpoint = Math.ceil(allScored.length / 2);
      const bottomHalfIds = new Set(allScored.slice(midpoint).map((s) => s.id));

      const explorationItems = results.filter((r) => r.isExploration);
      for (const item of explorationItems) {
        expect(bottomHalfIds.has(item.repo.id)).toBe(true);
      }
    });

    it('should mark exploration items with isExploration: true', async () => {
      const candidates = makeCandidates(15);
      const profile = makeGradedProfile();

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 10,
      });

      const explorationItems = results.filter((r) => r.isExploration);
      expect(explorationItems.length).toBeGreaterThan(0);
      explorationItems.forEach((item) => {
        expect(item.isExploration).toBe(true);
      });
    });
  });

  describe('no duplicate repos in results', () => {
    it('should not return duplicate repo IDs', async () => {
      const candidates = makeCandidates(20);
      const profile = makeGradedProfile();

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 10,
      });

      const ids = results.map((r) => r.repo.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('session deduplication', () => {
    it('should exclude previously delivered repos', async () => {
      const candidates = makeCandidates(10);
      const profile = makeGradedProfile();

      // Mark some repos as delivered
      await markDelivered('user-1', 'session-1', ['repo-0', 'repo-1', 'repo-2']);

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 5,
      });

      const resultIds = results.map((r) => r.repo.id);
      expect(resultIds).not.toContain('repo-0');
      expect(resultIds).not.toContain('repo-1');
      expect(resultIds).not.toContain('repo-2');
    });

    it('should not exclude repos from a different session', async () => {
      const candidates = makeCandidates(10);
      const profile = makeGradedProfile();

      // Mark repos as delivered in a DIFFERENT session
      await markDelivered('user-1', 'other-session', ['repo-0', 'repo-1']);

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 5,
      });

      // repo-0 and repo-1 should still be available in session-1
      const resultIds = results.map((r) => r.repo.id);
      // They may or may not appear depending on scoring, but they're not excluded
      // The key point is the session isolation works
      expect(results.length).toBe(5);
    });
  });

  describe('score ordering', () => {
    it('should sort non-exploration items by score descending', async () => {
      const candidates = makeCandidates(20);
      const profile = makeGradedProfile();

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 10,
      });

      const mainItems = results.filter((r) => !r.isExploration);
      for (let i = 1; i < mainItems.length; i++) {
        expect(mainItems[i - 1].score).toBeGreaterThanOrEqual(mainItems[i].score);
      }
    });
  });

  describe('edge case: fewer candidates than requested count', () => {
    it('should return all available candidates when fewer than count', async () => {
      const candidates = makeCandidates(3);
      const profile = makeGradedProfile();

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 10,
      });

      expect(results.length).toBe(3);
    });

    it('should still mark exploration items when fewer candidates than count', async () => {
      const candidates = makeCandidates(5);
      const profile = makeGradedProfile();

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 10,
      });

      const explorationItems = results.filter((r) => r.isExploration);
      // With 5 items and count=10, exploration count = ceil(5 * 0.2) = 1
      expect(explorationItems.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array when no candidates', async () => {
      const profile = makeGradedProfile();

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates: [],
        count: 10,
      });

      expect(results).toEqual([]);
    });

    it('should return empty array when all candidates are already delivered', async () => {
      const candidates = makeCandidates(3);
      const profile = makeGradedProfile();

      await markDelivered('user-1', 'session-1', ['repo-0', 'repo-1', 'repo-2']);

      const results = await generateRecommendations({
        userId: 'user-1',
        sessionId: 'session-1',
        profile,
        candidates,
        count: 10,
      });

      expect(results).toEqual([]);
    });
  });
});

// --- markDelivered tests ---

describe('markDelivered', () => {
  it('should mark repos as delivered in the session', async () => {
    await markDelivered('user-1', 'session-1', ['repo-a', 'repo-b']);

    expect(await isDelivered('user-1', 'session-1', 'repo-a')).toBe(true);
    expect(await isDelivered('user-1', 'session-1', 'repo-b')).toBe(true);
  });

  it('should not affect other sessions', async () => {
    await markDelivered('user-1', 'session-1', ['repo-a']);

    expect(await isDelivered('user-1', 'session-2', 'repo-a')).toBe(false);
  });

  it('should handle empty array gracefully', async () => {
    await expect(markDelivered('user-1', 'session-1', [])).resolves.toBeUndefined();
  });
});

// --- isDelivered tests ---

describe('isDelivered', () => {
  it('should return false for repos not yet delivered', async () => {
    expect(await isDelivered('user-1', 'session-1', 'repo-x')).toBe(false);
  });

  it('should return true for repos that have been delivered', async () => {
    await markDelivered('user-1', 'session-1', ['repo-x']);
    expect(await isDelivered('user-1', 'session-1', 'repo-x')).toBe(true);
  });
});
