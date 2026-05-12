/**
 * Unit tests for the interaction service.
 *
 * Tests cover:
 * - recordInteraction creates event in database
 * - toggleLike toggles between liked/not-liked states
 * - addFavorite creates favorite record
 * - removeFavorite deletes favorite record
 * - getInteractionState returns correct state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma, resetMockPrisma } from '@tests/helpers/prisma-mock';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock profile-service
vi.mock('@/services/profile-service', () => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  createDefaultProfile: vi.fn((userId: string) => ({
    id: '',
    userId,
    languageWeights: {},
    topicWeights: {},
    starRangeWeights: {},
    authorWeights: {},
    totalInteractions: 0,
  })),
}));

// Mock negative-feedback-service
vi.mock('@/services/negative-feedback-service', () => ({
  recordNotInterested: vi.fn(),
}));

// Mock profile-updater (return the profile with incremented interactions)
vi.mock('@/services/profile-updater', () => ({
  updateProfileWeights: vi.fn((profile) => ({ ...profile })),
}));

// Mock redis (needed by negative-feedback-service)
vi.mock('@/lib/redis', () => ({
  redis: { setex: vi.fn(), exists: vi.fn() },
  negativeFeedbackKey: vi.fn(),
  TTL_NEGATIVE_FEEDBACK: 604800,
}));

import {
  recordInteraction,
  toggleLike,
  addFavorite,
  removeFavorite,
  addFollow,
  removeFollow,
  getInteractionState,
} from '@/services/interaction-service';
import { getProfile, saveProfile } from '@/services/profile-service';
import { recordNotInterested } from '@/services/negative-feedback-service';
import { updateProfileWeights } from '@/services/profile-updater';

const mockedGetProfile = vi.mocked(getProfile);
const mockedSaveProfile = vi.mocked(saveProfile);
const mockedRecordNotInterested = vi.mocked(recordNotInterested);
const mockedUpdateProfileWeights = vi.mocked(updateProfileWeights);

describe('interaction-service', () => {
  beforeEach(() => {
    resetMockPrisma();
    vi.clearAllMocks();

    // Default: getProfile returns a profile
    mockedGetProfile.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      languageWeights: {},
      topicWeights: {},
      starRangeWeights: {},
      authorWeights: {},
      totalInteractions: 5,
    });

    // Default: updateProfileWeights returns the profile unchanged
    mockedUpdateProfileWeights.mockImplementation((profile) => ({ ...profile }));

    // Default: saveProfile resolves
    mockedSaveProfile.mockResolvedValue(undefined);
  });

  describe('recordInteraction', () => {
    it('creates an interaction event in the database', async () => {
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await recordInteraction(
        'user-1',
        { repoId: 'repo-1', type: 'like' },
        'owner/repo'
      );

      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          repoId: 'repo-1',
          repoFullName: 'owner/repo',
          type: 'like',
        }),
      });
    });

    it('updates user profile weights after recording event', async () => {
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await recordInteraction(
        'user-1',
        { repoId: 'repo-1', type: 'like', metadata: { language: 'Rust', topics: ['cli'] } },
        'owner/repo'
      );

      expect(mockedUpdateProfileWeights).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ id: 'repo-1', owner: 'owner', language: 'Rust' }),
        'like'
      );
      expect(mockedSaveProfile).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ totalInteractions: 6 })
      );
    });

    it('increments totalInteractions in user profile', async () => {
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await recordInteraction(
        'user-1',
        { repoId: 'repo-1', type: 'view', dwellTimeMs: 2000 },
        'owner/repo'
      );

      expect(mockedSaveProfile).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ totalInteractions: 6 })
      );
    });

    it('calls recordNotInterested for not_interested events', async () => {
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });
      mockedRecordNotInterested.mockResolvedValue(undefined);

      await recordInteraction(
        'user-1',
        { repoId: 'repo-1', type: 'not_interested' },
        'owner/repo'
      );

      expect(mockedRecordNotInterested).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ id: 'repo-1', owner: 'owner' })
      );
    });

    it('does not call recordNotInterested for non-not_interested events', async () => {
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await recordInteraction(
        'user-1',
        { repoId: 'repo-1', type: 'like' },
        'owner/repo'
      );

      expect(mockedRecordNotInterested).not.toHaveBeenCalled();
    });

    it('creates a default profile if none exists', async () => {
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });
      mockedGetProfile.mockResolvedValue(null);

      await recordInteraction(
        'user-1',
        { repoId: 'repo-1', type: 'like' },
        'owner/repo'
      );

      expect(mockedSaveProfile).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ totalInteractions: 1 })
      );
    });
  });

  describe('toggleLike', () => {
    it('likes a repo that is not currently liked', async () => {
      // No previous like/unlike events
      mockPrisma.interactionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await toggleLike('user-1', 'repo-1', 'owner/repo');

      expect(result).toEqual({ liked: true });
      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          repoId: 'repo-1',
          type: 'like',
        }),
      });
    });

    it('unlikes a repo that is currently liked', async () => {
      // Last event was a 'like'
      mockPrisma.interactionEvent.findFirst.mockResolvedValue({ type: 'like' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await toggleLike('user-1', 'repo-1', 'owner/repo');

      expect(result).toEqual({ liked: false });
      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          repoId: 'repo-1',
          type: 'unlike',
        }),
      });
    });

    it('re-likes a repo after unlike (like→unlike→like)', async () => {
      // Last event was an 'unlike'
      mockPrisma.interactionEvent.findFirst.mockResolvedValue({ type: 'unlike' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await toggleLike('user-1', 'repo-1', 'owner/repo');

      expect(result).toEqual({ liked: true });
      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'like',
        }),
      });
    });
  });

  describe('addFavorite', () => {
    it('creates a favorite record via upsert', async () => {
      mockPrisma.favorite.upsert.mockResolvedValue({ id: 'fav-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await addFavorite('user-1', 'repo-1', 'owner/repo', { name: 'repo' });

      expect(mockPrisma.favorite.upsert).toHaveBeenCalledWith({
        where: { userId_repoId: { userId: 'user-1', repoId: 'repo-1' } },
        create: expect.objectContaining({
          userId: 'user-1',
          repoId: 'repo-1',
          repoFullName: 'owner/repo',
          repoData: { name: 'repo' },
        }),
        update: expect.objectContaining({
          repoData: { name: 'repo' },
          repoFullName: 'owner/repo',
        }),
      });
    });

    it('records a favorite interaction event', async () => {
      mockPrisma.favorite.upsert.mockResolvedValue({ id: 'fav-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await addFavorite('user-1', 'repo-1', 'owner/repo', { name: 'repo' });

      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          repoId: 'repo-1',
          type: 'favorite',
        }),
      });
    });
  });

  describe('removeFavorite', () => {
    it('deletes the favorite record', async () => {
      mockPrisma.favorite.delete.mockResolvedValue({ id: 'fav-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await removeFavorite('user-1', 'repo-1', 'owner/repo');

      expect(mockPrisma.favorite.delete).toHaveBeenCalledWith({
        where: { userId_repoId: { userId: 'user-1', repoId: 'repo-1' } },
      });
    });

    it('records an unfavorite interaction event', async () => {
      mockPrisma.favorite.delete.mockResolvedValue({ id: 'fav-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await removeFavorite('user-1', 'repo-1', 'owner/repo');

      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          repoId: 'repo-1',
          type: 'unfavorite',
        }),
      });
    });
  });

  describe('addFollow', () => {
    it('creates a follow record via upsert', async () => {
      mockPrisma.follow.upsert.mockResolvedValue({ id: 'follow-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await addFollow('user-1', 'author-1', { name: 'Author' });

      expect(mockPrisma.follow.upsert).toHaveBeenCalledWith({
        where: { userId_authorId: { userId: 'user-1', authorId: 'author-1' } },
        create: expect.objectContaining({
          userId: 'user-1',
          authorId: 'author-1',
          authorData: { name: 'Author' },
        }),
        update: expect.objectContaining({
          authorData: { name: 'Author' },
        }),
      });
    });

    it('records a follow interaction event', async () => {
      mockPrisma.follow.upsert.mockResolvedValue({ id: 'follow-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await addFollow('user-1', 'author-1', { name: 'Author' });

      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          repoId: 'author-1',
          type: 'follow',
        }),
      });
    });
  });

  describe('removeFollow', () => {
    it('deletes the follow record', async () => {
      mockPrisma.follow.delete.mockResolvedValue({ id: 'follow-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await removeFollow('user-1', 'author-1');

      expect(mockPrisma.follow.delete).toHaveBeenCalledWith({
        where: { userId_authorId: { userId: 'user-1', authorId: 'author-1' } },
      });
    });

    it('records an unfollow interaction event', async () => {
      mockPrisma.follow.delete.mockResolvedValue({ id: 'follow-1' });
      mockPrisma.interactionEvent.create.mockResolvedValue({ id: 'event-1' });

      await removeFollow('user-1', 'author-1');

      expect(mockPrisma.interactionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          repoId: 'author-1',
          type: 'unfollow',
        }),
      });
    });
  });

  describe('getInteractionState', () => {
    it('returns liked=true when last event is like', async () => {
      mockPrisma.interactionEvent.findFirst.mockResolvedValue({ type: 'like' });
      mockPrisma.favorite.findUnique.mockResolvedValue(null);
      mockPrisma.follow.findUnique.mockResolvedValue(null);

      const state = await getInteractionState('user-1', 'repo-1', 'author-1');

      expect(state.liked).toBe(true);
    });

    it('returns liked=false when last event is unlike', async () => {
      mockPrisma.interactionEvent.findFirst.mockResolvedValue({ type: 'unlike' });
      mockPrisma.favorite.findUnique.mockResolvedValue(null);
      mockPrisma.follow.findUnique.mockResolvedValue(null);

      const state = await getInteractionState('user-1', 'repo-1', 'author-1');

      expect(state.liked).toBe(false);
    });

    it('returns favorited=true when favorite record exists', async () => {
      mockPrisma.interactionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.favorite.findUnique.mockResolvedValue({ id: 'fav-1' });
      mockPrisma.follow.findUnique.mockResolvedValue(null);

      const state = await getInteractionState('user-1', 'repo-1', 'author-1');

      expect(state.favorited).toBe(true);
    });

    it('returns followed=true when follow record exists', async () => {
      mockPrisma.interactionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.favorite.findUnique.mockResolvedValue(null);
      mockPrisma.follow.findUnique.mockResolvedValue({ id: 'follow-1' });

      const state = await getInteractionState('user-1', 'repo-1', 'author-1');

      expect(state.followed).toBe(true);
    });

    it('returns all false when no interactions exist', async () => {
      mockPrisma.interactionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.favorite.findUnique.mockResolvedValue(null);
      mockPrisma.follow.findUnique.mockResolvedValue(null);

      const state = await getInteractionState('user-1', 'repo-1', 'author-1');

      expect(state).toEqual({ liked: false, favorited: false, followed: false });
    });

    it('returns followed=false when no authorId is provided', async () => {
      mockPrisma.interactionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.favorite.findUnique.mockResolvedValue(null);

      const state = await getInteractionState('user-1', 'repo-1');

      expect(state.followed).toBe(false);
    });
  });
});
