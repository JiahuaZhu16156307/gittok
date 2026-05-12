/**
 * Favorites API Route - GET /api/favorites
 *
 * Returns a paginated list of the user's favorited repositories,
 * ordered by createdAt descending (most recent first).
 *
 * Query params:
 *   - page  (default 1)
 *   - limit (default 20, max 100)
 *
 * In mock mode (no DATABASE_URL or USE_MOCK_FEED=true), returns mock favorites
 * generated from the first 3 cards of the mock feed data.
 *
 * Validates: Requirements 7.1, 7.3, 7.6, Property 23
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMockRepoCards } from '@/services/mock-feed-data';

interface FavoriteItem {
  id: string;
  repoId: string;
  repoFullName: string;
  repoData: Record<string, unknown>;
  createdAt: string;
}

interface FavoritesResponse {
  items: FavoriteItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function shouldUseMockData(): boolean {
  return !process.env.DATABASE_URL || process.env.USE_MOCK_FEED === 'true';
}

/**
 * Builds a mock list of FavoriteItems from the first 3 mock feed cards.
 * Used in development/demo mode when no database is configured.
 */
function getMockFavorites(): FavoriteItem[] {
  const now = Date.now();
  return getMockRepoCards()
    .slice(0, 3)
    .map((card, index) => ({
      id: `mock-fav-${card.id}`,
      repoId: card.id,
      repoFullName: card.fullName,
      repoData: {
        description: card.description,
        language: card.language,
        starCount: card.starCount,
        forkCount: card.forkCount,
        topics: card.topics,
      },
      // Stagger timestamps so sort order is deterministic (newest first)
      createdAt: new Date(now - index * 60_000).toISOString(),
    }));
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<FavoritesResponse | { error: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse pagination params
    const { searchParams } = new URL(request.url);
    const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
    const limitRaw = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);

    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, MAX_LIMIT)
      : DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    // Mock mode: return a small deterministic mock set
    if (shouldUseMockData()) {
      const allMock = getMockFavorites();
      const items = allMock.slice(skip, skip + limit);
      const total = allMock.length;
      return NextResponse.json({
        items,
        total,
        page,
        hasMore: skip + items.length < total,
      });
    }

    // Real mode: query Prisma
    const { prisma } = await import('@/lib/prisma');

    const [rows, total] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.favorite.count({ where: { userId: user.id } }),
    ]);

    const items: FavoriteItem[] = rows.map((row) => ({
      id: row.id,
      repoId: row.repoId,
      repoFullName: row.repoFullName,
      repoData: (row.repoData ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({
      items,
      total,
      page,
      hasMore: skip + items.length < total,
    });
  } catch (error) {
    console.error('[Favorites API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
