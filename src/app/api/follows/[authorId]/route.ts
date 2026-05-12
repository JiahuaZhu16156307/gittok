/**
 * Follows [authorId] API Route - DELETE /api/follows/:authorId
 *
 * Removes an author from the user's follow list.
 *
 * Validates: Requirements 7.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

function hasDatabaseConnection(): boolean {
  return !!process.env.DATABASE_URL && process.env.USE_MOCK_FEED !== 'true';
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { authorId: string } }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { authorId } = params;
    if (!authorId) {
      return NextResponse.json(
        { error: 'Missing authorId parameter' },
        { status: 400 }
      );
    }

    // Mock mode
    if (!hasDatabaseConnection()) {
      return NextResponse.json({ success: true, mock: true });
    }

    // Real mode
    const { removeFollow } = await import('@/services/interaction-service');
    await removeFollow(user.id, authorId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Follows DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
