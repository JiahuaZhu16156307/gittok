/**
 * Follows API Route - GET /api/follows
 *
 * Returns a paginated list of the user's followed authors,
 * ordered by createdAt descending (most recent first).
 *
 * Validates: Requirements 7.4-7.6, Property 23
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

function hasDatabaseConnection(): boolean {
  return !!process.env.DATABASE_URL && process.env.USE_MOCK_FEED !== 'true';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20)
    );
    const skip = (page - 1) * limit;

    // Mock mode
    if (!hasDatabaseConnection()) {
      return NextResponse.json({
        items: [],
        total: 0,
        page: 1,
        hasMore: false,
      });
    }

    // Real mode
    const { prisma } = await import('@/lib/prisma');

    const [items, total] = await Promise.all([
      prisma.follow.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.follow.count({ where: { userId: user.id } }),
    ]);

    const hasMore = skip + items.length < total;

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        authorId: item.authorId,
        authorData: item.authorData,
        createdAt: item.createdAt,
      })),
      total,
      page,
      hasMore,
    });
  } catch (error) {
    console.error('[Follows API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
