/**
 * Settings API Route - GET/PUT /api/settings
 *
 * GET: Returns the user's current settings.
 * PUT: Updates user settings (blockForks, blockedLanguages).
 *
 * Validates: Requirements 9.3, 11.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

function hasDatabaseConnection(): boolean {
  return !!process.env.DATABASE_URL && process.env.USE_MOCK_FEED !== 'true';
}

/** Default settings for mock mode */
const DEFAULT_SETTINGS = {
  blockForks: false,
  blockedLanguages: [] as string[],
};

export async function GET(): Promise<NextResponse> {
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
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    // Real mode
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!settings) {
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    return NextResponse.json({
      blockForks: settings.blockForks,
      blockedLanguages: settings.blockedLanguages,
    });
  } catch (error) {
    console.error('[Settings GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    let body: { blockForks?: boolean; blockedLanguages?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate fields
    if (body.blockForks !== undefined && typeof body.blockForks !== 'boolean') {
      return NextResponse.json(
        { error: 'blockForks must be a boolean' },
        { status: 400 }
      );
    }
    if (body.blockedLanguages !== undefined && !Array.isArray(body.blockedLanguages)) {
      return NextResponse.json(
        { error: 'blockedLanguages must be an array of strings' },
        { status: 400 }
      );
    }

    // Mock mode
    if (!hasDatabaseConnection()) {
      return NextResponse.json({
        blockForks: body.blockForks ?? false,
        blockedLanguages: body.blockedLanguages ?? [],
      });
    }

    // Real mode
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        blockForks: body.blockForks ?? false,
        blockedLanguages: body.blockedLanguages ?? [],
      },
      update: {
        ...(body.blockForks !== undefined && { blockForks: body.blockForks }),
        ...(body.blockedLanguages !== undefined && { blockedLanguages: body.blockedLanguages }),
      },
    });

    return NextResponse.json({
      blockForks: settings.blockForks,
      blockedLanguages: settings.blockedLanguages,
    });
  } catch (error) {
    console.error('[Settings PUT] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
