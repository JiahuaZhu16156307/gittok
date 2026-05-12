/**
 * Reset Profile API Route - POST /api/settings/reset-profile
 *
 * Resets the user's recommendation profile, clearing all feature weights.
 * After reset, the recommendation engine will use Cold_Start_Strategy.
 *
 * Validates: Requirements 9.4, Property 24
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

function hasDatabaseConnection(): boolean {
  return !!process.env.DATABASE_URL && process.env.USE_MOCK_FEED !== 'true';
}

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Mock mode
    if (!hasDatabaseConnection()) {
      return NextResponse.json({ success: true, mock: true });
    }

    // Real mode
    const { resetProfile } = await import('@/services/profile-service');
    await resetProfile(user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Reset Profile] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
