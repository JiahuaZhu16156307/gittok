/**
 * Tests for the Feed API route (GET /api/feed).
 *
 * Tests the route handler with mock data mode enabled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module to avoid DB calls
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

// Force mock mode for all tests
vi.stubEnv('USE_MOCK_FEED', 'true');

import { GET } from '@/app/api/feed/route';
import { NextRequest } from 'next/server';

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a valid FeedResponse with default params', async () => {
    const request = createRequest('/api/feed');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('cards');
    expect(data).toHaveProperty('nextCursor');
    expect(data).toHaveProperty('hasMore');
    expect(Array.isArray(data.cards)).toBe(true);
    expect(data.cards.length).toBe(10);
    expect(data.hasMore).toBe(true);
  });

  it('should respect the limit query parameter', async () => {
    const request = createRequest('/api/feed?limit=5');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards.length).toBe(5);
  });

  it('should cap limit at MAX_LIMIT (50)', async () => {
    const request = createRequest('/api/feed?limit=100');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should be capped, not 100
    expect(data.cards.length).toBeLessThanOrEqual(50);
  });

  it('should return 400 for invalid limit parameter', async () => {
    const request = createRequest('/api/feed?limit=abc');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error');
  });

  it('should return 400 for negative limit', async () => {
    const request = createRequest('/api/feed?limit=-5');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error');
  });

  it('should return 400 for zero limit', async () => {
    const request = createRequest('/api/feed?limit=0');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error');
  });

  it('should support cursor-based pagination', async () => {
    const firstRequest = createRequest('/api/feed?limit=5');
    const firstResponse = await GET(firstRequest);
    const firstData = await firstResponse.json();

    expect(firstData.nextCursor).not.toBeNull();

    const secondRequest = createRequest(`/api/feed?limit=5&cursor=${encodeURIComponent(firstData.nextCursor)}`);
    const secondResponse = await GET(secondRequest);
    const secondData = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondData.cards.length).toBe(5);

    // Cards should be different between pages
    const firstIds = firstData.cards.map((c: { id: string }) => c.id);
    const secondIds = secondData.cards.map((c: { id: string }) => c.id);
    expect(firstIds).not.toEqual(secondIds);
  });

  it('should handle missing cursor gracefully', async () => {
    const request = createRequest('/api/feed');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards.length).toBeGreaterThan(0);
  });

  it('should return cards with proper RepoCard structure', async () => {
    const request = createRequest('/api/feed?limit=1');
    const response = await GET(request);
    const data = await response.json();

    const card = data.cards[0];
    expect(card).toHaveProperty('id');
    expect(card).toHaveProperty('fullName');
    expect(card).toHaveProperty('owner');
    expect(card).toHaveProperty('name');
    expect(card).toHaveProperty('description');
    expect(card).toHaveProperty('starCount');
    expect(card).toHaveProperty('forkCount');
    expect(card).toHaveProperty('topics');
    expect(card).toHaveProperty('isArchived');
    expect(card).toHaveProperty('isFork');
    expect(card).toHaveProperty('readmeSummary');
    expect(card).toHaveProperty('lastCommitAt');
    expect(card).toHaveProperty('defaultBranch');
    expect(card).toHaveProperty('updatedAt');
  });
});
