/**
 * Feed API Route - GET /api/feed
 *
 * Returns a paginated list of repository cards for the feed.
 * Accepts optional `cursor` and `limit` query parameters.
 *
 * In development (or when no DB/GitHub token is available), returns mock data.
 * In production with a configured database, uses the real feed service pipeline.
 *
 * Validates: Requirements 3.4, 6.1, 10.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMockFeedResponse } from '@/services/mock-feed-data';
import { createFeedService } from '@/services/feed-service';
import type { FeedResponse } from '@/lib/types';

/** Maximum allowed limit per request */
const MAX_LIMIT = 50;
/** Default number of cards per request */
const DEFAULT_LIMIT = 10;

/**
 * Determines whether to use mock data instead of the real feed service.
 * Returns true when the database or GitHub token is not configured.
 */
function shouldUseMockData(): boolean {
  // Use mock data if DATABASE_URL is not set or if explicitly in mock mode
  const hasDatabase = !!process.env.DATABASE_URL;
  const useMock = process.env.USE_MOCK_FEED === 'true';

  if (useMock) return true;
  if (!hasDatabase) return true;

  return false;
}

export async function GET(request: NextRequest): Promise<NextResponse<FeedResponse | { error: string }>> {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const cursorParam = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');

    // Validate and parse limit
    let limit = DEFAULT_LIMIT;
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: 'Invalid limit parameter. Must be a positive integer.' },
          { status: 400 }
        );
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    // Prefer explicit `page` param from client; convert to cursor offset
    // page=1 → offset=0, page=2 → offset=limit, page=N → offset=(N-1)*limit
    let cursor = cursorParam;
    if (pageParam !== null) {
      const pageNum = parseInt(pageParam, 10);
      if (!isNaN(pageNum) && pageNum >= 1) {
        const offset = (pageNum - 1) * limit;
        cursor = JSON.stringify({ offset });
      }
    }

    // Use mock data in development or when DB is unavailable
    if (shouldUseMockData()) {
      const response = getMockFeedResponse(cursor, limit);
      return NextResponse.json(response);
    }

    // Production path: use real feed service
    const user = await getCurrentUser();
    const userId = user?.id ?? 'anonymous';
    const sessionId = generateSessionId(userId);
    const userToken = (user as any)?.githubToken;

    const feedService = await createRealFeedService(userToken);
    const response = await feedService.getNextBatch({
      userId,
      sessionId,
      cursor,
      limit,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Feed API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching feed.' },
      { status: 500 }
    );
  }
}

/**
 * Generates a session ID for feed deduplication.
 * Uses a date-based approach so the session resets daily.
 */
function generateSessionId(userId: string): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${userId}:${today}`;
}

/**
 * Creates the real feed service with production dependencies.
 * Uses Neon PostgreSQL for user profiles and Upstash Redis for caching.
 * Fetches real repos from GitHub Search API.
 */
async function createRealFeedService(userToken?: string) {
  const { generateRecommendations, markDelivered } = await import('@/services/feed-generator');
  const { getSuppressionStatus } = await import('@/services/negative-feedback-service');
  const { getProfile, createDefaultProfile } = await import('@/services/profile-service');
  const { createGitHubClient } = await import('@/services/github-client');
  const { filterService } = await import('@/services/filter-service');
  const { prisma } = await import('@/lib/prisma');

  const githubClient = createGitHubClient(userToken);

  const feedService = createFeedService({
    getProfile: async (userId: string) => {
      try {
        return await getProfile(userId);
      } catch {
        return null;
      }
    },
    createDefaultProfile: (userId: string) => createDefaultProfile(userId),
    getUserSettings: async (userId: string) => {
      try {
        const settings = await prisma.userSettings.findUnique({ where: { userId } });
        return settings
          ? { id: settings.id, userId: settings.userId, blockForks: settings.blockForks, blockedLanguages: settings.blockedLanguages }
          : { id: 'default', userId, blockForks: false, blockedLanguages: [] };
      } catch {
        return { id: 'default', userId, blockForks: false, blockedLanguages: [] };
      }
    },
    githubClient,
    filterService,
    checkSuppression: async () => {
      // Skip suppression checks for now to avoid N+1 queries slowing down feed
      // TODO: batch check suppressions
      return { blocked: false };
    },
    generateRecommendations,
    markDelivered,
  });

  return feedService;
}
