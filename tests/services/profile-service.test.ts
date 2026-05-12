import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetMockPrisma } from '@tests/helpers/prisma-mock';

// Mock the prisma module to use our mock client
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  createDefaultProfile,
  getProfile,
  saveProfile,
  resetProfile,
} from '@/services/profile-service';

describe('profile-service', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  describe('createDefaultProfile', () => {
    it('returns a profile with all weights as empty objects', () => {
      const profile = createDefaultProfile('user-123');

      expect(profile.userId).toBe('user-123');
      expect(profile.languageWeights).toEqual({});
      expect(profile.topicWeights).toEqual({});
      expect(profile.starRangeWeights).toEqual({});
      expect(profile.authorWeights).toEqual({});
    });

    it('returns totalInteractions as 0', () => {
      const profile = createDefaultProfile('user-456');

      expect(profile.totalInteractions).toBe(0);
    });

    it('sets id to empty string (not yet persisted)', () => {
      const profile = createDefaultProfile('user-789');

      expect(profile.id).toBe('');
    });

    it('returns correct structure with all required fields', () => {
      const profile = createDefaultProfile('user-abc');

      expect(profile).toHaveProperty('id');
      expect(profile).toHaveProperty('userId');
      expect(profile).toHaveProperty('languageWeights');
      expect(profile).toHaveProperty('topicWeights');
      expect(profile).toHaveProperty('starRangeWeights');
      expect(profile).toHaveProperty('authorWeights');
      expect(profile).toHaveProperty('totalInteractions');
    });
  });

  describe('getProfile', () => {
    it('returns null for non-existent user', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);

      const result = await getProfile('non-existent-user');

      expect(result).toBeNull();
      expect(mockPrisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'non-existent-user' },
      });
    });

    it('returns mapped UserProfile when record exists', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-123',
        languageWeights: { TypeScript: 0.8, Rust: 0.6 },
        topicWeights: { web: 0.7 },
        starRangeWeights: { '100-1000': 0.5 },
        authorWeights: { octocat: 0.9 },
        totalInteractions: 42,
        lastUpdatedAt: new Date(),
      });

      const result = await getProfile('user-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('profile-1');
      expect(result!.userId).toBe('user-123');
      expect(result!.languageWeights).toEqual({ TypeScript: 0.8, Rust: 0.6 });
      expect(result!.topicWeights).toEqual({ web: 0.7 });
      expect(result!.starRangeWeights).toEqual({ '100-1000': 0.5 });
      expect(result!.authorWeights).toEqual({ octocat: 0.9 });
      expect(result!.totalInteractions).toBe(42);
    });
  });

  describe('saveProfile', () => {
    it('upserts the profile in the database', async () => {
      mockPrisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-123',
        languageWeights: { TypeScript: 0.5 },
        topicWeights: { web: 0.3 },
        starRangeWeights: { '100-1000': 0.4 },
        authorWeights: { octocat: 0.6 },
        totalInteractions: 10,
        lastUpdatedAt: new Date(),
      });

      const profile = {
        id: 'profile-1',
        userId: 'user-123',
        languageWeights: { TypeScript: 0.5 },
        topicWeights: { web: 0.3 },
        starRangeWeights: { '100-1000': 0.4 },
        authorWeights: { octocat: 0.6 },
        totalInteractions: 10,
      };

      await saveProfile('user-123', profile);

      expect(mockPrisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        create: {
          userId: 'user-123',
          languageWeights: { TypeScript: 0.5 },
          topicWeights: { web: 0.3 },
          starRangeWeights: { '100-1000': 0.4 },
          authorWeights: { octocat: 0.6 },
          totalInteractions: 10,
        },
        update: {
          languageWeights: { TypeScript: 0.5 },
          topicWeights: { web: 0.3 },
          starRangeWeights: { '100-1000': 0.4 },
          authorWeights: { octocat: 0.6 },
          totalInteractions: 10,
        },
      });
    });
  });

  describe('resetProfile', () => {
    it('sets all weights to empty objects and totalInteractions to 0', async () => {
      mockPrisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-123',
        languageWeights: {},
        topicWeights: {},
        starRangeWeights: {},
        authorWeights: {},
        totalInteractions: 0,
        lastUpdatedAt: new Date(),
      });

      const result = await resetProfile('user-123');

      expect(result.languageWeights).toEqual({});
      expect(result.topicWeights).toEqual({});
      expect(result.starRangeWeights).toEqual({});
      expect(result.authorWeights).toEqual({});
      expect(result.totalInteractions).toBe(0);
    });

    it('calls upsert with empty weights and zero interactions', async () => {
      mockPrisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-456',
        languageWeights: {},
        topicWeights: {},
        starRangeWeights: {},
        authorWeights: {},
        totalInteractions: 0,
        lastUpdatedAt: new Date(),
      });

      await resetProfile('user-456');

      expect(mockPrisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-456' },
        create: {
          userId: 'user-456',
          languageWeights: {},
          topicWeights: {},
          starRangeWeights: {},
          authorWeights: {},
          totalInteractions: 0,
        },
        update: {
          languageWeights: {},
          topicWeights: {},
          starRangeWeights: {},
          authorWeights: {},
          totalInteractions: 0,
        },
      });
    });

    it('returns a valid UserProfile object after reset', async () => {
      mockPrisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-reset',
        userId: 'user-789',
        languageWeights: {},
        topicWeights: {},
        starRangeWeights: {},
        authorWeights: {},
        totalInteractions: 0,
        lastUpdatedAt: new Date(),
      });

      const result = await resetProfile('user-789');

      expect(result.id).toBe('profile-reset');
      expect(result.userId).toBe('user-789');
      expect(result.totalInteractions).toBe(0);
      // totalInteractions = 0 means cold start will be triggered (< 10 threshold)
    });
  });
});
