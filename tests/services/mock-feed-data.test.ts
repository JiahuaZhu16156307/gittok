/**
 * Tests for mock feed data service.
 */

import { describe, it, expect } from 'vitest';
import { getMockRepoCards, getMockFeedResponse } from '@/services/mock-feed-data';

describe('getMockRepoCards', () => {
  it('should return at least 20 mock repo cards', () => {
    const cards = getMockRepoCards();
    expect(cards.length).toBeGreaterThanOrEqual(20);
  });

  it('should return cards with all required fields', () => {
    const cards = getMockRepoCards();
    for (const card of cards) {
      expect(card.id).toBeTruthy();
      expect(card.fullName).toBeTruthy();
      expect(card.owner).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.description).toBeTruthy();
      expect(typeof card.starCount).toBe('number');
      expect(typeof card.forkCount).toBe('number');
      expect(Array.isArray(card.topics)).toBe(true);
      expect(card.topics.length).toBeGreaterThan(0);
      expect(typeof card.isArchived).toBe('boolean');
      expect(typeof card.isFork).toBe('boolean');
      expect(card.readmeSummary).toBeTruthy();
      expect(card.lastCommitAt).toBeInstanceOf(Date);
      expect(card.defaultBranch).toBeTruthy();
      expect(card.updatedAt).toBeInstanceOf(Date);
    }
  });

  it('should return cards with unique IDs', () => {
    const cards = getMockRepoCards();
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should not include archived or fork repos', () => {
    const cards = getMockRepoCards();
    for (const card of cards) {
      expect(card.isArchived).toBe(false);
      expect(card.isFork).toBe(false);
    }
  });
});

describe('getMockFeedResponse', () => {
  it('should return default 10 cards when no params provided', () => {
    const response = getMockFeedResponse();
    expect(response.cards.length).toBe(10);
    expect(response.hasMore).toBe(true);
    expect(response.nextCursor).not.toBeNull();
  });

  it('should respect the limit parameter', () => {
    const response = getMockFeedResponse(undefined, 5);
    expect(response.cards.length).toBe(5);
    expect(response.hasMore).toBe(true);
  });

  it('should paginate using cursor', () => {
    const first = getMockFeedResponse(undefined, 5);
    expect(first.nextCursor).not.toBeNull();

    const second = getMockFeedResponse(first.nextCursor!, 5);
    expect(second.cards.length).toBe(5);

    // Cards should be different between pages
    const firstIds = first.cards.map((c) => c.id);
    const secondIds = second.cards.map((c) => c.id);
    expect(firstIds).not.toEqual(secondIds);
  });

  it('should return hasMore=false when reaching the end', () => {
    const allCards = getMockRepoCards();
    const response = getMockFeedResponse(undefined, allCards.length + 10);
    expect(response.hasMore).toBe(false);
    expect(response.nextCursor).toBeNull();
  });

  it('should handle invalid cursor gracefully', () => {
    const response = getMockFeedResponse('invalid-json', 5);
    expect(response.cards.length).toBe(5);
    // Should start from beginning
    const firstResponse = getMockFeedResponse(undefined, 5);
    expect(response.cards[0].id).toBe(firstResponse.cards[0].id);
  });

  it('should return FeedResponse shape', () => {
    const response = getMockFeedResponse();
    expect(response).toHaveProperty('cards');
    expect(response).toHaveProperty('nextCursor');
    expect(response).toHaveProperty('hasMore');
    expect(Array.isArray(response.cards)).toBe(true);
  });
});
