/**
 * Interactions API Route - POST /api/interactions
 *
 * Records a single user interaction event.
 *
 * Auth rules:
 *   - Protected types (like, unlike, favorite, unfavorite, follow, unfollow)
 *     require an authenticated user. Unauthenticated requests are rejected
 *     with 401 without modifying any state.
 *   - Anonymous types (view, quick_skip, not_interested, open_external)
 *     are accepted without authentication.
 *
 * Mock mode:
 *   - When DATABASE_URL is not set or USE_MOCK_FEED=true, the route acts as
 *     a no-op and returns { success: true, mock: true } with HTTP 200.
 *
 * Body shape (CreateInteractionRequest):
 *   {
 *     repoId: string,
 *     type: InteractionType,
 *     repoFullName?: string,       // optional top-level field; falls back to metadata.fullName or repoId
 *     dwellTimeMs?: number,
 *     metadata?: Record<string, unknown>
 *   }
 *
 * Validates: Requirements 4.1-4.5, 4.8, 5.1, 1.6, Property 22
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import type { CreateInteractionRequest, InteractionType } from '@/lib/types/interaction';

/** Interaction types that require authentication */
const PROTECTED_TYPES: ReadonlySet<InteractionType> = new Set<InteractionType>([
  'like',
  'unlike',
  'favorite',
  'unfavorite',
  'follow',
  'unfollow',
]);

/** All valid interaction types accepted by this route */
const VALID_TYPES: ReadonlySet<InteractionType> = new Set<InteractionType>([
  'like',
  'unlike',
  'favorite',
  'unfavorite',
  'follow',
  'unfollow',
  'not_interested',
  'view',
  'quick_skip',
  'open_external',
]);

/**
 * Returns true when the route should operate in mock (no-op) mode.
 * Mock mode is active when there is no DATABASE_URL or USE_MOCK_FEED=true.
 */
function isMockMode(): boolean {
  if (process.env.USE_MOCK_FEED === 'true') return true;
  if (!process.env.DATABASE_URL) return true;
  return false;
}

/**
 * Resolves the repo full name from the request body, preferring the
 * top-level `repoFullName` field, then `metadata.fullName`, then the raw
 * `repoId` as a last resort.
 */
function resolveRepoFullName(body: CreateInteractionRequest): string {
  if (typeof body.repoFullName === 'string' && body.repoFullName.length > 0) {
    return body.repoFullName;
  }
  const fromMeta = body.metadata?.fullName;
  if (typeof fromMeta === 'string' && fromMeta.length > 0) {
    return fromMeta;
  }
  return body.repoId;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse body
  let body: CreateInteractionRequest;
  try {
    body = (await request.json()) as CreateInteractionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof body.repoId !== 'string' || body.repoId.length === 0) {
    return NextResponse.json(
      { error: 'Missing or invalid field: repoId' },
      { status: 400 }
    );
  }
  if (typeof body.type !== 'string' || !VALID_TYPES.has(body.type as InteractionType)) {
    return NextResponse.json(
      { error: `Invalid or missing interaction type: ${String(body.type)}` },
      { status: 400 }
    );
  }

  // Enforce auth on protected interaction types
  const user = await getCurrentUser();
  if (PROTECTED_TYPES.has(body.type) && !user) {
    return NextResponse.json(
      { error: 'Authentication required for this interaction type' },
      { status: 401 }
    );
  }

  // Mock mode: no-op, acknowledge with success + mock flag
  if (isMockMode()) {
    return NextResponse.json({ success: true, mock: true }, { status: 200 });
  }

  if (!user) {
    return NextResponse.json(
      { success: true, anonymous: true },
      { status: 200 }
    );
  }

  // Real mode: delegate to the interaction service
  try {
    const userId = user.id;
    const repoFullName = resolveRepoFullName(body);
    const { recordInteraction } = await import('@/services/interaction-service');

    await recordInteraction(userId, body, repoFullName);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[Interactions API] Error recording interaction:', error);
    return NextResponse.json(
      { error: 'Internal server error while recording interaction' },
      { status: 500 }
    );
  }
}
