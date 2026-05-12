/**
 * Favorites [repoId] API Route - DELETE /api/favorites/:repoId
 *
 * Removes a repository from the user's favorites list.
 *
 * Requires an authenticated user. In mock mode (no DATABASE_URL or
 * USE_MOCK_FEED=true), responds with { success: true, mock: true }
 * without hitting the database.
 *
 * Validates: Requirements 7.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

function shouldUseMockData(): boolean {
  return !process.env.DATABASE_URL || process.env.USE_MOCK_FEED === 'true';
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { repoId: string } }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const repoId = params?.repoId;
    if (!repoId) {
      return NextResponse.json(
        { error: 'Missing repoId parameter' },
        { status: 400 }
      );
    }

    // Mock mode: acknowledge the delete without touching persistent state
    if (shouldUseMockData()) {
      return NextResponse.json({ success: true, mock: true });
    }

    // Real mode: look up the favorite to recover its repoFullName so the
    // downstream interaction event is properly labeled, then delegate to
    // the interaction service.
    const { prisma } = await import('@/lib/prisma');
    const existing = await prisma.favorite.findUnique({
      where: { userId_repoId: { userId: user.id, repoId } },
      select: { repoFullName: true },
    });

    if (!existing) {
      // Nothing to delete; treat as success for idempotency.
      return NextResponse.json({ success: true });
    }

    const { removeFavorite } = await import('@/services/interaction-service');
    await removeFavorite(user.id, repoId, existing.repoFullName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Favorites DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
