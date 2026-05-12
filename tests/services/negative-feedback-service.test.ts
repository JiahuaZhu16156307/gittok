import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetMockPrisma } from '@tests/helpers/prisma-mock';
import { mockRedis, resetMockRedis } from '@tests/helpers/redis-mock';
import type { RepoCard } from '@/lib/types/repo';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/redis', () => ({
  redis: mockRedis,
  negativeFeedbackKey: (userId: string, repoId: string) => `user:negfeedback:${userId}:${repoId}`,
  TTL_NEGATIVE_FEEDBACK: 604800, // 7 days in seconds
}));

import {
  recordNotInterested,
  isRepoBlocked,
  isAuthorSuppressed,
  getTopicWeightCap,
  getTopicWeightCapAsync,
  getSuppressionStatus,
} from '@/services/negative-feedback-service';

function createTestRepo(overrides: Partial<RepoCard> = {}): RepoCard {
  return {
    id: 'repo-123',
    fullName: 'testowner/testrepo',
    owner: 'testowner',
    name: 'testrepo',
    description: 'A test repository',
    language: 'TypeScript',
    starCount: 100,
    forkCount: 10,
    topics: ['web', 'testing'],
    isArchived: false,
    isFork: false,
    readmeSummary: 'Test readme',
    lastCommitAt: new Date(),
    defaultBranch: 'main',
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('negative-feedback-service', () => {
  beforeEach(() => {
    resetMockPrisma();
    resetMockRedis();
  });

  describe('recordNotInterested', () => {
    it('sets Redis key with 7-day TTL', async () => {
      const repo = createTestRepo();

      // Mock Prisma upsert calls
      mockPrisma.negativeFeedbackRecord.upsert.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'repo',
        targetValue: repo.id,
        count: 1,
        lastAt: new Date(),
        expiresAt: null,
      });

      await recordNotInterested('user-1', repo);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user:negfeedback:user-1:repo-123',
        604800, // 7 days in seconds
        '1'
      );
    });

    it('upserts repo, author, and topic records in Prisma', async () => {
      const repo = createTestRepo({ topics: ['web', 'cli'] });

      mockPrisma.negativeFeedbackRecord.upsert.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'repo',
        targetValue: repo.id,
        count: 1,
        lastAt: new Date(),
        expiresAt: null,
      });

      await recordNotInterested('user-1', repo);

      // Should be called for: repo + author + 2 topics = 4 times
      expect(mockPrisma.negativeFeedbackRecord.upsert).toHaveBeenCalledTimes(4);

      // Verify repo upsert
      expect(mockPrisma.negativeFeedbackRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_targetType_targetValue: {
              userId: 'user-1',
              targetType: 'repo',
              targetValue: 'repo-123',
            },
          },
        })
      );

      // Verify author upsert
      expect(mockPrisma.negativeFeedbackRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_targetType_targetValue: {
              userId: 'user-1',
              targetType: 'author',
              targetValue: 'testowner',
            },
          },
        })
      );

      // Verify topic upserts
      expect(mockPrisma.negativeFeedbackRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_targetType_targetValue: {
              userId: 'user-1',
              targetType: 'topic',
              targetValue: 'web',
            },
          },
        })
      );

      expect(mockPrisma.negativeFeedbackRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_targetType_targetValue: {
              userId: 'user-1',
              targetType: 'topic',
              targetValue: 'cli',
            },
          },
        })
      );
    });

    it('sets 30-day expiry when author count reaches 3', async () => {
      const repo = createTestRepo();

      // Author record returns count = 3 (threshold reached)
      mockPrisma.negativeFeedbackRecord.upsert.mockImplementation(async (args: { where: { userId_targetType_targetValue: { targetType: string } } }) => {
        if (args.where.userId_targetType_targetValue.targetType === 'author') {
          return {
            id: 'nfr-author',
            userId: 'user-1',
            targetType: 'author',
            targetValue: 'testowner',
            count: 3,
            lastAt: new Date(),
            expiresAt: null,
          };
        }
        return {
          id: 'nfr-other',
          userId: 'user-1',
          targetType: 'repo',
          targetValue: repo.id,
          count: 1,
          lastAt: new Date(),
          expiresAt: null,
        };
      });

      mockPrisma.negativeFeedbackRecord.update.mockResolvedValue({
        id: 'nfr-author',
        userId: 'user-1',
        targetType: 'author',
        targetValue: 'testowner',
        count: 3,
        lastAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await recordNotInterested('user-1', repo);

      // Should call update to set expiresAt
      expect(mockPrisma.negativeFeedbackRecord.update).toHaveBeenCalledWith({
        where: { id: 'nfr-author' },
        data: { expiresAt: expect.any(Date) },
      });
    });
  });

  describe('isRepoBlocked', () => {
    it('returns true when Redis key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await isRepoBlocked('user-1', 'repo-123');

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('user:negfeedback:user-1:repo-123');
    });

    it('returns false when Redis key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await isRepoBlocked('user-1', 'repo-456');

      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith('user:negfeedback:user-1:repo-456');
    });
  });

  describe('isAuthorSuppressed', () => {
    it('returns true when count >= 3 and expiresAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day from now
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'author',
        targetValue: 'badauthor',
        count: 3,
        lastAt: new Date(),
        expiresAt: futureDate,
      });

      const result = await isAuthorSuppressed('user-1', 'badauthor');

      expect(result).toBe(true);
    });

    it('returns false when count < 3', async () => {
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'author',
        targetValue: 'someauthor',
        count: 2,
        lastAt: new Date(),
        expiresAt: null,
      });

      const result = await isAuthorSuppressed('user-1', 'someauthor');

      expect(result).toBe(false);
    });

    it('returns false when no record exists', async () => {
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue(null);

      const result = await isAuthorSuppressed('user-1', 'unknownauthor');

      expect(result).toBe(false);
    });

    it('returns false when expiresAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 1 day ago
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'author',
        targetValue: 'expiredauthor',
        count: 5,
        lastAt: new Date(),
        expiresAt: pastDate,
      });

      const result = await isAuthorSuppressed('user-1', 'expiredauthor');

      expect(result).toBe(false);
    });

    it('returns false when count >= 3 but expiresAt is null', async () => {
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'author',
        targetValue: 'someauthor',
        count: 4,
        lastAt: new Date(),
        expiresAt: null,
      });

      const result = await isAuthorSuppressed('user-1', 'someauthor');

      expect(result).toBe(false);
    });
  });

  describe('getTopicWeightCap', () => {
    it('returns cap (20% of average) when count >= 5', () => {
      const record = { count: 5 };
      const averageWeight = 0.5;

      const result = getTopicWeightCap('user-1', 'web', averageWeight, record);

      expect(result).toBe(0.1); // 0.5 * 0.2 = 0.1
    });

    it('returns null when count < 5', () => {
      const record = { count: 4 };
      const averageWeight = 0.5;

      const result = getTopicWeightCap('user-1', 'web', averageWeight, record);

      expect(result).toBeNull();
    });

    it('returns null when record is null', () => {
      const result = getTopicWeightCap('user-1', 'web', 0.5, null);

      expect(result).toBeNull();
    });

    it('returns correct cap for different average weights', () => {
      const record = { count: 10 };

      expect(getTopicWeightCap('user-1', 'cli', 1.0, record)).toBe(0.2);
      expect(getTopicWeightCap('user-1', 'cli', 0.8, record)).toBeCloseTo(0.16);
      expect(getTopicWeightCap('user-1', 'cli', 0.0, record)).toBe(0.0);
    });
  });

  describe('getTopicWeightCapAsync', () => {
    it('returns cap when count >= 5', async () => {
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'topic',
        targetValue: 'web',
        count: 7,
        lastAt: new Date(),
        expiresAt: null,
      });

      const result = await getTopicWeightCapAsync('user-1', 'web', 0.5);

      expect(result).toBe(0.1);
    });

    it('returns null when count < 5', async () => {
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'topic',
        targetValue: 'web',
        count: 3,
        lastAt: new Date(),
        expiresAt: null,
      });

      const result = await getTopicWeightCapAsync('user-1', 'web', 0.5);

      expect(result).toBeNull();
    });
  });

  describe('getSuppressionStatus', () => {
    it('returns blocked with repo_not_interested reason when repo is blocked', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const repo = createTestRepo();
      const result = await getSuppressionStatus('user-1', repo);

      expect(result).toEqual({ blocked: true, reason: 'repo_not_interested' });
    });

    it('returns blocked with author_suppressed reason when author is suppressed', async () => {
      mockRedis.exists.mockResolvedValue(0); // repo not blocked

      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue({
        id: 'nfr-1',
        userId: 'user-1',
        targetType: 'author',
        targetValue: 'testowner',
        count: 3,
        lastAt: new Date(),
        expiresAt: futureDate,
      });

      const repo = createTestRepo();
      const result = await getSuppressionStatus('user-1', repo);

      expect(result).toEqual({ blocked: true, reason: 'author_suppressed' });
    });

    it('returns not blocked when neither repo nor author is suppressed', async () => {
      mockRedis.exists.mockResolvedValue(0); // repo not blocked
      mockPrisma.negativeFeedbackRecord.findUnique.mockResolvedValue(null); // no author record

      const repo = createTestRepo();
      const result = await getSuppressionStatus('user-1', repo);

      expect(result).toEqual({ blocked: false });
    });
  });
});
